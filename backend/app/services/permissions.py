from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models import Collection, CollectionMember, Role, User

_RANK = {Role.viewer: 0, Role.editor: 1, Role.owner: 2}


async def member_role(session: AsyncSession, user: User, collection_id: str) -> Role | None:
    res = await session.exec(
        select(CollectionMember.role).where(
            CollectionMember.collection_id == collection_id,
            CollectionMember.user_id == user.id,
        )
    )
    return res.first()


async def require_member(
    session: AsyncSession, user: User, collection_id: str, min_role: Role = Role.viewer
) -> tuple[Collection, Role]:
    coll = await session.get(Collection, collection_id)
    if coll is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    role = await member_role(session, user, collection_id)
    if role is None or _RANK[role] < _RANK[min_role]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient access to this collection")
    return coll, role


async def accessible_collection_ids(session: AsyncSession, user: User) -> list[str]:
    res = await session.exec(
        select(CollectionMember.collection_id).where(CollectionMember.user_id == user.id)
    )
    return list(res.all())
