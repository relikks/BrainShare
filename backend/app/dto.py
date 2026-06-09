"""Request/response shapes for the drive + search API (kept out of the legacy
`schemas.py`, which still serves the extension routers)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import FileStatus, Modality, Role


class _FromAttrs(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Collections ──
class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CollectionOut(BaseModel):
    id: str
    name: str
    slug: str
    role: Role
    created_at: datetime


class MemberAdd(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    role: Role = Role.viewer


class MemberOut(BaseModel):
    username: str
    role: Role


# ── Directories ──
class DirectoryCreate(BaseModel):
    collection_id: str
    parent_id: str | None = None
    name: str = Field(min_length=1, max_length=200)


class DirectoryOut(_FromAttrs):
    id: str
    collection_id: str
    parent_id: str | None
    name: str
    path: str
    created_at: datetime


# ── Files ──
class FileOut(_FromAttrs):
    id: str
    collection_id: str
    directory_id: str | None
    name: str
    modality: Modality
    mime: str
    size: int
    status: FileStatus
    error: str | None = None
    created_at: datetime


class Crumb(BaseModel):
    id: str | None  # None = collection root
    name: str


class BrowseOut(BaseModel):
    collection: CollectionOut
    directory_id: str | None
    breadcrumb: list[Crumb]
    directories: list[DirectoryOut]
    files: list[FileOut]


# ── Search ──
class SearchQuery(BaseModel):
    query: str = Field(min_length=1)
    modalities: list[Modality] = Field(default_factory=lambda: list(Modality))
    collection_ids: list[str] | None = None  # None = all accessible
    directory_id: str | None = None  # scope to a folder…
    include_subdirs: bool = True  # …and everything under it
    top_k: int = Field(default=20, ge=1, le=100)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)  # relevance floor (noise cut)


class Segment(BaseModel):
    space: str
    score: float
    text: str | None = None
    segment: str | None = None  # chunk idx / window ts / frame ts label
    goto_url: str | None = None


class SearchHit(BaseModel):
    file_id: str
    file_name: str
    modality: Modality
    collection_id: str
    directory_id: str | None
    dir_path: str
    breadcrumb: list[Crumb]
    score: float
    best: Segment
    matched_spaces: list[str]


class SearchResults(BaseModel):
    hits: list[SearchHit]
