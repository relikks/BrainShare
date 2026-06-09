from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from . import models  # noqa: F401 — ensure tables are registered on metadata
from .config import settings

# echo off; pool defaults fine for dev. For SQLite async, aiosqlite handles a file.
engine = create_async_engine(settings.database_url, future=True)
_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """Dev convenience: create tables from metadata. Prod uses Alembic migrations."""
    if settings.database_url.startswith("sqlite"):
        # ./data/brainshare.db → ensure parent dir exists.
        db_path = settings.database_url.split(":///", 1)[-1]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with _session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
