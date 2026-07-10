"""Bootstrap the user/OAuth layer on the CONFIGURED database:

  1. ensure a user exists for --email (the example/tester account)
  2. mint an API key for it (paste into the secretary's config)
  3. optionally reassign EVERY existing collection/file to that user (--claim-all),
     making them its owner — this is "move current data to the example account"

Blobs and Qdrant vectors are keyed by file id, which never changes, so claiming
only touches the relational rows; media + embeddings stay put and keep matching.

Run (backend may stay up — it writes only a handful of rows):
    PYTHONPATH=. .venv/bin/python scripts/bootstrap_tester.py \
        --email relikkkk+tester@proton.me --key-name "secretary" --claim-all
"""

import argparse
import asyncio

from sqlmodel import select

from app.db import _session_factory
from app.models import Collection, CollectionMember, File, Role, User
from app.services import apikeys as apikey_svc
from app.services import users as user_svc


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--username", default=None)
    ap.add_argument("--key-name", default="secretary")
    ap.add_argument("--claim-all", action="store_true",
                    help="reassign every existing collection/file to this user (make it owner)")
    args = ap.parse_args()

    async with _session_factory() as s:
        user = await user_svc.get_user_by_email(s, args.email)
        if user is None:
            username = await user_svc._unique_username(s, args.username or args.email.split("@")[0])
            user = User(username=username, email=args.email)
            s.add(user)
            await s.commit()
            await s.refresh(user)
            print(f"✓ created user  {user.username}  id={user.id}  email={user.email}")
        else:
            print(f"• user exists   {user.username}  id={user.id}  email={user.email}")

        if args.claim_all:
            colls = list((await s.exec(select(Collection))).all())
            for c in colls:
                c.owner_id = user.id
                s.add(c)
                m = (
                    await s.exec(
                        select(CollectionMember).where(
                            CollectionMember.collection_id == c.id,
                            CollectionMember.user_id == user.id,
                        )
                    )
                ).first()
                if m is None:
                    s.add(CollectionMember(collection_id=c.id, user_id=user.id, role=Role.owner))
                else:
                    m.role = Role.owner
                    s.add(m)
            files = list((await s.exec(select(File))).all())
            for f in files:
                f.owner_id = user.id
                s.add(f)
            await s.commit()
            print(f"✓ claimed  {len(colls)} collections, {len(files)} files  → {user.username}")

        key, raw = await apikey_svc.mint(s, user.id, args.key_name)
        print("\n=== API KEY (store now — shown ONCE) ===")
        print(f"  {raw}")
        print(f"  (label={key.name!r} prefix={key.prefix})")


if __name__ == "__main__":
    asyncio.run(main())
