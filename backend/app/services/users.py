import re
import uuid as uuidlib

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models import User


async def get_user_by_uuid(session: AsyncSession, user_uuid: str) -> User | None:
    res = await session.exec(select(User).where(User.uuid == user_uuid))
    return res.first()


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    res = await session.exec(select(User).where(User.email == email))
    return res.first()


async def _unique_username(session: AsyncSession, base: str) -> str:
    base = re.sub(r"[^a-z0-9_.-]", "", (base or "").lower()) or "user"
    name, i = base, 1
    while await get_user_by_username(session, name) is not None:
        i += 1
        name = f"{base}{i}"
    return name


async def upsert_from_oauth(session: AsyncSession, sub: str, email: str | None) -> User:
    """Find-or-create the BrainShare user behind a Supabase-Auth identity. Matches by
    the stable `sub` first, then by email (links a pre-existing account), else creates
    a fresh user with a derived unique username."""
    user = (await session.exec(select(User).where(User.oauth_sub == sub))).first()
    if user is None and email:
        user = await get_user_by_email(session, email)
    if user is None:
        username = await _unique_username(session, (email or sub).split("@")[0])
        user = User(username=username, email=email, oauth_sub=sub)
        session.add(user)
    else:
        if user.oauth_sub != sub:
            user.oauth_sub = sub
        if email and user.email != email:
            user.email = email
        session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


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
