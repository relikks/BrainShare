import uuid as uuidlib
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from .enums import FileStatus, Modality, Role


def new_id() -> str:
    """Portable string PK (uuid4 hex) — same value used in Qdrant payloads."""
    return uuidlib.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    username: str = Field(index=True, unique=True)
    uuid: str = Field(index=True, unique=True)  # the bearer credential
    created_at: datetime = Field(default_factory=utcnow)


class Collection(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="user.id", index=True)
    name: str
    slug: str = Field(index=True)
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
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
