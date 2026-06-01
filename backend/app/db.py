import os
import uuid as uuidlib
from pathlib import Path

import aiosqlite

from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    username   TEXT PRIMARY KEY,
    uuid       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
"""


async def init_db() -> None:
    Path(settings.users_db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.users_db_path) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def create_user(username: str) -> tuple[str, str] | None:
    """Return (username, uuid) or None if username already exists."""
    new_uuid = str(uuidlib.uuid4())
    async with aiosqlite.connect(settings.users_db_path) as db:
        try:
            await db.execute(
                "INSERT INTO users (username, uuid) VALUES (?, ?)",
                (username, new_uuid),
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            return None
    return username, new_uuid


async def get_user_by_uuid(user_uuid: str) -> str | None:
    """Return username for a given uuid, or None if not found."""
    async with aiosqlite.connect(settings.users_db_path) as db:
        async with db.execute(
            "SELECT username FROM users WHERE uuid = ?", (user_uuid,)
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row else None
