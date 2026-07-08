"""Personal knowledge graph: people / events / categories, file↔entity links, and the
per-collection face inbox (cluster unassigned faces → name them → link files to people).

Everything is user-scoped and consent-based — entities and their links exist only over
the user's own collections; there is no external lookup or stranger identification.
"""

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile
from fastapi import File as FormFile
from sqlmodel import delete, select

from .. import vector_store
from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import (
    EntityCreate,
    EntityOut,
    FaceAssign,
    FaceInboxCluster,
    FaceOut,
    FileEntitiesUpdate,
)
from ..models import Entity, EntityKind, Face, File, FileEntity
from ..services.permissions import accessible_collection_ids, require_member
from ..storage import get_storage

router = APIRouter(tags=["graph"])


# ── Entities (people / events / categories) ──────────────────────────────────
@router.post("/entities", response_model=EntityOut, status_code=201)
async def create_entity(payload: EntityCreate, user: CurrentUser, session: SessionDep) -> EntityOut:
    e = Entity(owner_id=user.id, kind=payload.kind, name=payload.name.strip(), meta=payload.meta or {})
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return EntityOut.model_validate(e)


@router.get("/entities", response_model=list[EntityOut])
async def list_entities(
    user: CurrentUser, session: SessionDep, kind: EntityKind | None = Query(default=None)
) -> list[EntityOut]:
    stmt = select(Entity).where(Entity.owner_id == user.id)
    if kind:
        stmt = stmt.where(Entity.kind == kind)
    rows = (await session.exec(stmt.order_by(Entity.name))).all()
    return [EntityOut.model_validate(e) for e in rows]


@router.patch("/entities/{entity_id}", response_model=EntityOut)
async def rename_entity(
    entity_id: str, payload: EntityCreate, user: CurrentUser, session: SessionDep
) -> EntityOut:
    e = await _own_entity(session, user, entity_id)
    e.name = payload.name.strip()
    if payload.meta is not None:
        e.meta = payload.meta
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return EntityOut.model_validate(e)


@router.delete("/entities/{entity_id}", status_code=204)
async def delete_entity(entity_id: str, user: CurrentUser, session: SessionDep) -> None:
    e = await _own_entity(session, user, entity_id)
    key = (e.meta or {}).get("photo_key")
    await session.exec(delete(FileEntity).where(FileEntity.entity_id == entity_id))
    await session.exec(
        Face.__table__.update().where(Face.person_id == entity_id).values(person_id=None)
    )
    await session.delete(e)
    await session.commit()
    if key:
        await get_storage().delete(key)


# ── Entity profile photo (person avatars, etc.) ───────────────────────────────
@router.post("/entities/{entity_id}/photo", response_model=EntityOut)
async def set_entity_photo(
    entity_id: str,
    user: CurrentUser,
    session: SessionDep,
    file: UploadFile = FormFile(...),
) -> EntityOut:
    """Store an entity's profile photo as a blob and record its key/mime in `meta`."""
    e = await _own_entity(session, user, entity_id)
    data = await file.read()
    key = f"avatars/{e.id}"
    await get_storage().put(key, data)
    e.meta = {**(e.meta or {}), "photo_key": key, "photo_mime": file.content_type or "image/jpeg"}
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return EntityOut.model_validate(e)


@router.get("/entities/{entity_id}/photo")
async def get_entity_photo(entity_id: str, user: CurrentUser, session: SessionDep) -> Response:
    e = await _own_entity(session, user, entity_id)
    key = (e.meta or {}).get("photo_key")
    if not key:
        raise HTTPException(404, "No photo")
    data = await get_storage().get(key)
    return Response(content=data, media_type=(e.meta or {}).get("photo_mime", "image/jpeg"))


@router.delete("/entities/{entity_id}/photo", response_model=EntityOut)
async def delete_entity_photo(
    entity_id: str, user: CurrentUser, session: SessionDep
) -> EntityOut:
    e = await _own_entity(session, user, entity_id)
    key = (e.meta or {}).get("photo_key")
    if key:
        await get_storage().delete(key)
    e.meta = {k: v for k, v in (e.meta or {}).items() if k not in ("photo_key", "photo_mime")}
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return EntityOut.model_validate(e)


# ── File ↔ entity links ──────────────────────────────────────────────────────
@router.put("/files/{file_id}/entities", response_model=list[EntityOut])
async def set_file_entities(
    file_id: str, payload: FileEntitiesUpdate, user: CurrentUser, session: SessionDep
) -> list[EntityOut]:
    """Replace a file's links for the given entity kind (add/remove people/events/…)."""
    f = await _accessible_file(session, user, file_id)
    ids = set(payload.entity_ids)
    # Validate the entities belong to the user.
    valid = (
        await session.exec(select(Entity).where(Entity.owner_id == user.id, Entity.id.in_(ids)))
    ).all() if ids else []
    valid_ids = {e.id for e in valid if e.kind == payload.kind}
    # Current links of this kind.
    current = (
        await session.exec(
            select(FileEntity, Entity)
            .join(Entity, Entity.id == FileEntity.entity_id)
            .where(FileEntity.file_id == f.id, Entity.kind == payload.kind)
        )
    ).all()
    cur_ids = {fe.entity_id for fe, _ in current}
    for fe, _ in current:
        if fe.entity_id not in valid_ids:
            await session.delete(fe)
    for eid in valid_ids - cur_ids:
        session.add(FileEntity(file_id=f.id, entity_id=eid))
    await session.commit()
    return await _file_entities(session, f.id)


@router.get("/files/{file_id}/entities", response_model=list[EntityOut])
async def get_file_entities(file_id: str, user: CurrentUser, session: SessionDep) -> list[EntityOut]:
    f = await _accessible_file(session, user, file_id)
    return await _file_entities(session, f.id)


# ── Face inbox: cluster unnamed faces → assign to a person ────────────────────
@router.get("/collections/{collection_id}/faces/inbox", response_model=list[FaceInboxCluster])
async def face_inbox(
    collection_id: str, user: CurrentUser, session: SessionDep
) -> list[FaceInboxCluster]:
    """Unassigned faces in the collection, greedily clustered by ArcFace similarity so the
    user names each group once. Threshold ~0.45 cosine (embeddings are L2-normed)."""
    await require_member(session, user, collection_id)
    faces = (
        await session.exec(
            select(Face).where(Face.collection_id == collection_id, Face.person_id.is_(None))
        )
    ).all()
    if not faces:
        return []
    vecs = await vector_store.get_vectors("face", [f.point_id for f in faces])
    items = [(f, vecs.get(f.point_id)) for f in faces]
    items = [(f, v) for f, v in items if v]

    def cos(a: list[float], b: list[float]) -> float:
        return sum(x * y for x, y in zip(a, b))

    clusters: list[list] = []
    centroids: list[list[float]] = []
    for f, v in items:
        placed = False
        for i, c in enumerate(centroids):
            if cos(v, c) >= 0.45:
                clusters[i].append(f)
                placed = True
                break
        if not placed:
            clusters.append([f])
            centroids.append(v)
    clusters.sort(key=len, reverse=True)
    return [
        FaceInboxCluster(
            face_ids=[f.id for f in group],
            faces=[FaceOut.model_validate(f) for f in group[:6]],
            count=len(group),
        )
        for group in clusters
    ]


@router.post("/faces/assign", response_model=EntityOut)
async def assign_faces(payload: FaceAssign, user: CurrentUser, session: SessionDep) -> EntityOut:
    """Assign a set of faces to a person (existing id or a new name) and link each face's
    file to that person — the moment a cluster becomes 'Ana'."""
    if payload.person_id:
        person = await _own_entity(session, user, payload.person_id)
        if person.kind != EntityKind.person:
            raise HTTPException(400, "Target is not a person")
    else:
        if not payload.name or not payload.name.strip():
            raise HTTPException(400, "person_id or name required")
        person = Entity(owner_id=user.id, kind=EntityKind.person, name=payload.name.strip())
        session.add(person)
        await session.flush()

    accessible = set(await accessible_collection_ids(session, user))
    faces = [
        f
        for f in (await session.exec(select(Face).where(Face.id.in_(payload.face_ids)))).all()
        if f.collection_id in accessible
    ]
    if not faces:
        await session.refresh(person)
        return EntityOut.model_validate(person)

    # Auto-pickup: also grab any OTHER unassigned faces (in the same collections) that
    # match this person, so naming once catches every photo they appear in — no
    # per-photo reclassifying. Match = cosine ≥0.5 against the assigned faces' centroid.
    coll_ids = {f.collection_id for f in faces}
    seed_vecs = await vector_store.get_vectors("face", [f.point_id for f in faces])
    if seed_vecs:
        dim = len(next(iter(seed_vecs.values())))
        centroid = [sum(v[i] for v in seed_vecs.values()) / len(seed_vecs) for i in range(dim)]
        norm = sum(x * x for x in centroid) ** 0.5 or 1.0
        centroid = [x / norm for x in centroid]
        others = (
            await session.exec(
                select(Face).where(
                    Face.collection_id.in_(coll_ids),
                    Face.person_id.is_(None),
                    Face.id.notin_([f.id for f in faces]),
                )
            )
        ).all()
        cand_vecs = await vector_store.get_vectors("face", [o.point_id for o in others])
        for o in others:
            v = cand_vecs.get(o.point_id)
            if v and sum(a * b for a, b in zip(v, centroid)) >= 0.5:
                faces.append(o)

    linked: set[str] = set()
    for face in faces:
        face.person_id = person.id
        session.add(face)
        if face.file_id in linked:
            continue
        linked.add(face.file_id)
        exists = (
            await session.exec(
                select(FileEntity).where(
                    FileEntity.file_id == face.file_id, FileEntity.entity_id == person.id
                )
            )
        ).first()
        if not exists:
            session.add(FileEntity(file_id=face.file_id, entity_id=person.id))
    await session.commit()
    await session.refresh(person)
    return EntityOut.model_validate(person)


# ── helpers ──────────────────────────────────────────────────────────────────
async def _own_entity(session, user, entity_id: str) -> Entity:
    e = await session.get(Entity, entity_id)
    if e is None or e.owner_id != user.id:
        raise HTTPException(404, "Entity not found")
    return e


async def _accessible_file(session, user, file_id: str) -> File:
    f = await session.get(File, file_id)
    if f is None:
        raise HTTPException(404, "File not found")
    accessible = set(await accessible_collection_ids(session, user))
    if f.collection_id not in accessible:
        raise HTTPException(404, "File not found")
    return f


async def _file_entities(session, file_id: str) -> list[EntityOut]:
    rows = (
        await session.exec(
            select(Entity).join(FileEntity, FileEntity.entity_id == Entity.id).where(
                FileEntity.file_id == file_id
            )
        )
    ).all()
    return [EntityOut.model_validate(e) for e in rows]
