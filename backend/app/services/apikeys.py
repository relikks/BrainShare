"""API keys — programmatic credentials that act AS a user (the secretary).

The raw key (`bsk_<hex>`) is returned once at creation and never stored; we keep
only its SHA-256 hash, plus a short prefix to identify it in the UI.
"""

import hashlib
import secrets

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models import ApiKey, User, utcnow

KEY_PREFIX = "bsk_"


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def mint(session: AsyncSession, user_id: str, name: str) -> tuple[ApiKey, str]:
    """Create a key for a user. Returns (row, RAW_KEY) — surface the raw key ONCE."""
    raw = KEY_PREFIX + secrets.token_hex(24)  # bsk_ + 48 hex chars
    key = ApiKey(user_id=user_id, name=name.strip()[:120], prefix=raw[:12], hash=_hash(raw))
    session.add(key)
    await session.commit()
    await session.refresh(key)
    return key, raw


async def verify(session: AsyncSession, raw: str) -> User | None:
    """Resolve a raw API key to its (non-revoked) user, stamping last_used_at."""
    if not raw.startswith(KEY_PREFIX):
        return None
    res = await session.exec(
        select(ApiKey).where(ApiKey.hash == _hash(raw), ApiKey.revoked == False)  # noqa: E712
    )
    key = res.first()
    if key is None:
        return None
    key.last_used_at = utcnow()
    session.add(key)
    await session.commit()
    return await session.get(User, key.user_id)


async def list_for(session: AsyncSession, user_id: str) -> list[ApiKey]:
    res = await session.exec(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(res.all())


async def revoke(session: AsyncSession, user_id: str, key_id: str) -> bool:
    key = await session.get(ApiKey, key_id)
    if key is None or key.user_id != user_id:
        return False
    key.revoked = True
    session.add(key)
    await session.commit()
    return True
