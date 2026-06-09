import uuid as uuidlib

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models import User


async def get_user_by_uuid(session: AsyncSession, user_uuid: str) -> User | None:
    res = await session.exec(select(User).where(User.uuid == user_uuid))
    return res.first()


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    res = await session.exec(select(User).where(User.username == username))
    return res.first()


async def create_user(session: AsyncSession, username: str) -> User | None:
    """Create a user with a fresh bearer UUID. Returns None if username is taken."""
    if await get_user_by_username(session, username) is not None:
        return None
    user = User(username=username, uuid=str(uuidlib.uuid4()))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user
