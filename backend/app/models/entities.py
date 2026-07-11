import uuid as uuidlib
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from .enums import FileStatus, Modality, Role


def new_id() -> str:
    """Portable string PK (uuid4 hex) — same value used in Qdrant payloads."""
    return uuidlib.uuid4().hex


def utcnow() -> datetime:
    # Naive UTC. The DB columns are TIMESTAMP WITHOUT TIME ZONE; a tz-aware value
    # makes asyncpg raise "can't subtract offset-naive and offset-aware datetimes"
    # on insert (Postgres is stricter than SQLite, which silently accepted it).
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    username: str = Field(index=True, unique=True)
    # Legacy bearer credential (pre-OAuth). Kept for the transition + service scripts;
    # real login is now Supabase-Auth JWT (oauth_sub/email) or an API key.
    uuid: str = Field(default_factory=lambda: str(uuidlib.uuid4()), index=True, unique=True)
    email: str | None = Field(default=None, index=True, unique=True)
    oauth_sub: str | None = Field(default=None, index=True, unique=True)  # Supabase auth user id (JWT `sub`)
    created_at: datetime = Field(default_factory=utcnow)


class ApiKey(SQLModel, table=True):
    """A programmatic credential that acts AS its user (the secretary uses one to
    upload/search on the owner's behalf). Only the SHA-256 hash is stored — the raw
    key (`bsk_…`) is shown exactly once at creation."""

    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    name: str = ""  # human label, e.g. "secretary (apple watch)"
    prefix: str = Field(index=True)  # first chars of the key, shown to identify it
    hash: str = Field(index=True, unique=True)  # sha256(raw key)
    created_at: datetime = Field(default_factory=utcnow)
    last_used_at: datetime | None = None
    revoked: bool = Field(default=False)


class Collection(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="user.id", index=True)
    name: str
    slug: str = Field(index=True)
    # Per-collection AI module overrides (module name → bool). Defaults live in app/modules.py;
    # the pipeline gates each processing step (image/audio/video embed, transcription, OCR…) on this.
    modules: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class CollectionMember(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("collection_id", "user_id", name="uq_member"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    collection_id: str = Field(foreign_key="collection.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: Role = Field(default=Role.viewer)
    created_at: datetime = Field(default_factory=utcnow)


class Directory(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    collection_id: str = Field(foreign_key="collection.id", index=True)
    parent_id: str | None = Field(default=None, foreign_key="directory.id", index=True)
    name: str
    # Materialized for cheap subtree scoping + breadcrumbs. Both root→self inclusive.
    ancestor_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    path: str = Field(default="/")  # display names, e.g. "/Papers/2026"
    created_at: datetime = Field(default_factory=utcnow)


class File(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    collection_id: str = Field(foreign_key="collection.id", index=True)
    directory_id: str | None = Field(default=None, foreign_key="directory.id", index=True)
    owner_id: str = Field(foreign_key="user.id", index=True)
    name: str
    modality: Modality
    mime: str = ""
    size: int = 0
    blob_key: str = ""
    status: FileStatus = Field(default=FileStatus.pending, index=True)
    error: str | None = None
    # Per-type structured metadata (§1): image {width,height,aspect}; video {duration_s,fps,...};
    # audio {duration_s,sample_rate,...}; text {word_count,lang}. Also stamped into the Qdrant payload
    # (`meta`) so search can filter on it (MetaFilter → Range/Match).
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Per-pipeline index state (pipeline key → "ready" | "failed" | "off"). Lets the
    # search UI grey out pipelines with no index, and reindex scripts find files an
    # added model hasn't processed. NOTE: needs a migration on existing DBs
    # (create_all won't add the column) — same caveat as `meta`.
    index_status: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
