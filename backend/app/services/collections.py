import re

from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from .. import vector_store
from ..models import Collection, CollectionMember, Directory, File, Role, User
from ..storage import get_storage
from . import permissions, users as user_service


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "collection"


async def create_collection(session: AsyncSession, owner: User, name: str) -> Collection:
    coll = Collection(owner_id=owner.id, name=name, slug=_slugify(name))
    session.add(coll)
    # owner is also a member (role=owner) so all access checks go through one table
    session.add(CollectionMember(collection_id=coll.id, user_id=owner.id, role=Role.owner))
    await session.commit()
    await session.refresh(coll)
    return coll


async def list_for_user(session: AsyncSession, user: User) -> list[tuple[Collection, Role]]:
    res = await session.exec(
        select(Collection, CollectionMember.role)
        .join(CollectionMember, CollectionMember.collection_id == Collection.id)
        .where(CollectionMember.user_id == user.id)
        .order_by(Collection.created_at)
    )
    return list(res.all())


async def add_member(
    session: AsyncSession, collection_id: str, username: str, role: Role
) -> tuple[User, Role]:
    target = await user_service.get_user_by_username(session, username)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No user '{username}'")
    existing = await session.exec(
        select(CollectionMember).where(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == target.id,
        )
    )
    member = existing.first()
    if member is None:
        member = CollectionMember(collection_id=collection_id, user_id=target.id, role=role)
        session.add(member)
    else:
        member.role = role
        session.add(member)
    await session.commit()
    return target, role


async def list_members(session: AsyncSession, collection_id: str) -> list[tuple[User, Role]]:
    res = await session.exec(
        select(User, CollectionMember.role)
        .join(CollectionMember, CollectionMember.user_id == User.id)
        .where(CollectionMember.collection_id == collection_id)
    )
    return list(res.all())


async def delete_collection(session: AsyncSession, collection_id: str) -> None:
    """Purge a collection: its files' vectors + blobs, then dirs, members, row."""
    files = (await session.exec(select(File).where(File.collection_id == collection_id))).all()
    for f in files:
        await vector_store.delete_file(f.id)
        await get_storage().delete(f.blob_key)
        await session.delete(f)
    for d in (await session.exec(select(Directory).where(Directory.collection_id == collection_id))).all():
        await session.delete(d)
    for m in (await session.exec(select(CollectionMember).where(CollectionMember.collection_id == collection_id))).all():
        await session.delete(m)
    coll = await session.get(Collection, collection_id)
    if coll:
        await session.delete(coll)
    await session.commit()
