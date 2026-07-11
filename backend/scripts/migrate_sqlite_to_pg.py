"""Copy the SQLite corpus into the CURRENT database (Postgres), reassigning ownership
to --email. Preserves every primary key, so the on-disk blobs (blob_key = collection/id)
and the Qdrant vectors (payload file_id/collection_id) keep matching untouched.

Robust + idempotent: existing ids are skipped, and any row whose foreign keys aren't
satisfied (orphaned faces/links, missing parent dir) is skipped or null-linked rather
than aborting the whole migration. Safe to re-run.

    PYTHONPATH=. .venv/bin/python scripts/migrate_sqlite_to_pg.py --email you@example.com
"""

import argparse
import asyncio
import json
import sqlite3
from datetime import datetime

from sqlmodel import select

from app.db import _session_factory
from app.models import (
    Collection,
    CollectionMember,
    Directory,
    Entity,
    File,
    FileEntity,
    Face,
    FileStatus,
    Modality,
    Role,
    User,
    utcnow,
)
from app.models.enums import EntityKind
from app.services import users as user_svc

SRC = "data/brainshare.db"


def _dt(s):
    if not s:
        return utcnow()
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:
        return utcnow()


def _rows(con, table):
    con.row_factory = sqlite3.Row
    return [dict(r) for r in con.execute(f"select * from {table}")]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--src", default=SRC)
    args = ap.parse_args()

    src = sqlite3.connect(args.src)
    data = {t: _rows(src, t) for t in ["collection", "directory", "file", "entity", "fileentity", "face"]}

    async with _session_factory() as s:
        user = await user_svc.get_user_by_email(s, args.email)
        if user is None:
            uname = await user_svc._unique_username(s, args.email.split("@")[0])
            user = User(username=uname, email=args.email)
            s.add(user)
            await s.commit()
            await s.refresh(user)
            print(f"created target user {user.username} ({user.id})")
        else:
            print(f"target user {user.username} ({user.id})")
        uid = user.id

        async def id_set(col):
            return set((await s.exec(select(col))).all())

        # Preload what already exists (in-memory checks → no mid-batch autoflush surprises).
        valid_coll = await id_set(Collection.id)
        valid_dir = await id_set(Directory.id)
        valid_ent = await id_set(Entity.id)
        valid_file = await id_set(File.id)
        have_fe = await id_set(FileEntity.id)
        have_face = await id_set(Face.id)
        member_pairs = {
            (m.collection_id, m.user_id) for m in (await s.exec(select(CollectionMember))).all()
        }

        n = dict.fromkeys(["collection", "member", "directory", "entity", "file", "fileentity", "face"], 0)
        skip = dict.fromkeys(["directory", "file", "fileentity", "face"], 0)

        for r in data["collection"]:
            if r["id"] in valid_coll:
                continue
            s.add(Collection(id=r["id"], owner_id=uid, name=r["name"], slug=r["slug"],
                             modules=json.loads(r["modules"] or "{}"), created_at=_dt(r["created_at"])))
            valid_coll.add(r["id"])
            n["collection"] += 1
        await s.commit()

        for cid in valid_coll:
            if (cid, uid) in member_pairs:
                continue
            s.add(CollectionMember(collection_id=cid, user_id=uid, role=Role.owner))
            member_pairs.add((cid, uid))
            n["member"] += 1
        await s.commit()

        # Directories parents-first (depth = len(ancestor_ids), root→self inclusive).
        for r in sorted(data["directory"], key=lambda r: len(json.loads(r["ancestor_ids"] or "[]"))):
            if r["id"] in valid_dir:
                continue
            if r["collection_id"] not in valid_coll:
                skip["directory"] += 1
                continue
            parent = r["parent_id"] if (r["parent_id"] is None or r["parent_id"] in valid_dir) else None
            s.add(Directory(id=r["id"], collection_id=r["collection_id"], parent_id=parent, name=r["name"],
                            ancestor_ids=json.loads(r["ancestor_ids"] or "[]"), path=r["path"],
                            created_at=_dt(r["created_at"])))
            valid_dir.add(r["id"])
            n["directory"] += 1
        await s.commit()

        for r in data["entity"]:
            if r["id"] in valid_ent:
                continue
            s.add(Entity(id=r["id"], owner_id=uid, kind=EntityKind(r["kind"]), name=r["name"],
                         meta=json.loads(r["meta"] or "{}"), created_at=_dt(r["created_at"])))
            valid_ent.add(r["id"])
            n["entity"] += 1
        await s.commit()

        for r in data["file"]:
            if r["id"] in valid_file:
                continue
            if r["collection_id"] not in valid_coll:
                skip["file"] += 1
                continue
            did = r["directory_id"] if (r["directory_id"] is None or r["directory_id"] in valid_dir) else None
            s.add(File(id=r["id"], collection_id=r["collection_id"], directory_id=did, owner_id=uid,
                       name=r["name"], modality=Modality(r["modality"]), mime=r["mime"] or "",
                       size=r["size"] or 0, blob_key=r["blob_key"] or "", status=FileStatus(r["status"]),
                       error=r["error"], meta=json.loads(r["meta"] or "{}"),
                       index_status=json.loads(r["index_status"] or "{}"),
                       created_at=_dt(r["created_at"]), updated_at=_dt(r["updated_at"])))
            valid_file.add(r["id"])
            n["file"] += 1
        await s.commit()

        for r in data["fileentity"]:
            if r["id"] in have_fe:
                continue
            if r["file_id"] not in valid_file or r["entity_id"] not in valid_ent:
                skip["fileentity"] += 1
                continue
            s.add(FileEntity(id=r["id"], file_id=r["file_id"], entity_id=r["entity_id"],
                             created_at=_dt(r["created_at"])))
            n["fileentity"] += 1

        for r in data["face"]:
            if r["id"] in have_face:
                continue
            if r["file_id"] not in valid_file or r["collection_id"] not in valid_coll:
                skip["face"] += 1
                continue
            pid = r["person_id"] if (r["person_id"] is None or r["person_id"] in valid_ent) else None
            s.add(Face(id=r["id"], file_id=r["file_id"], collection_id=r["collection_id"],
                       point_id=r["point_id"], bbox=json.loads(r["bbox"] or "[]"),
                       score=r["score"] or 0.0, person_id=pid, created_at=_dt(r["created_at"])))
            n["face"] += 1
        await s.commit()

        print("migrated:", n)
        print("skipped (orphans):", skip)


if __name__ == "__main__":
    asyncio.run(main())
