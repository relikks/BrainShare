"""Request/response shapes for the drive + search API (kept out of the legacy
`schemas.py`, which still serves the extension routers)."""

from datetime import datetime
from typing import Any, Literal

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
    meta: dict = {}  # §1 per-type metadata (image dims, video/audio duration, text word_count…)
    index_status: dict = {}  # pipeline key → "ready" | "failed" | "off" (search-pipeline gating)
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
class MetaFilter(BaseModel):
    """A structured filter on a file's per-type metadata (Qdrant payload `meta.<field>`).
    Combined with vector ranking: it only narrows the candidate set, never reorders. (§1)"""

    field: str  # e.g. "duration_s", "width", "height", "fps", "word_count", "lang"
    op: Literal["eq", "in", "gte", "lte", "gt", "lt"] = "eq"
    value: Any


class SearchQuery(BaseModel):
    # Empty = filter-only search: return everything matching the filters at 1.00
    # (membership, not relevance) instead of ranking by a query vector.
    query: str = Field(default="", max_length=1000)
    modalities: list[Modality] = Field(default_factory=lambda: list(Modality))
    # Named search pipelines (embedding.registry.PIPELINES keys). None/empty = every
    # pipeline of the selected modalities (legacy behaviour). Naming them narrows the
    # search to exactly those ways of looking — e.g. ["audio.transcript"].
    pipelines: list[str] | None = None
    # Restrict to files linked to these entities (people / events / categories).
    entity_ids: list[str] | None = None
    entity_match: Literal["any", "all"] = "any"  # any = OR (union); all = AND (must have every)
    collection_ids: list[str] | None = None  # None = all accessible
    directory_id: str | None = None  # scope to a folder…
    include_subdirs: bool = True  # …and everything under it
    filters: list[MetaFilter] = Field(default_factory=list)  # type-aware metadata filters (§1)
    top_k: int = Field(default=20, ge=1, le=100)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)  # relevance floor (noise cut)


class Segment(BaseModel):
    space: str
    pipeline: str | None = None  # which pipeline produced this segment's score
    score: float
    text: str | None = None
    segment: str | None = None  # chunk idx / window ts / frame ts label
    goto_url: str | None = None
    loc: dict | None = None  # source location for jump/highlight: {start,end} (text/pdf char offsets)


class SearchHit(BaseModel):
    file_id: str
    file_name: str
    modality: Modality
    collection_id: str
    directory_id: str | None
    dir_path: str
    breadcrumb: list[Crumb]
    score: float  # best cosine across pipelines (display); ordering may be RRF-fused
    best: Segment
    hits: list[Segment] = Field(default_factory=list)  # top matching chunks of this file (best first)
    matched_spaces: list[str]
    matched_pipelines: list[str] = Field(default_factory=list)


class SearchResults(BaseModel):
    hits: list[SearchHit]


# ── AI modules (per-collection) ──
class ModuleInfo(BaseModel):
    name: str
    label: str
    desc: str
    modalities: list[str]
    enabled: bool


class ModulesOut(BaseModel):
    modules: list[ModuleInfo]


class ModulesUpdate(BaseModel):
    modules: dict[str, bool]  # module name → enabled override


class TagCount(BaseModel):
    tag: str
    count: int


# ── Knowledge graph (people / events / categories + faces) ──
class EntityCreate(BaseModel):
    kind: Literal["person", "event", "category", "event_type"] = "person"
    name: str
    meta: dict | None = None


class EntityOut(_FromAttrs):
    id: str
    kind: str
    name: str
    meta: dict = {}
    created_at: datetime


class FileEntitiesUpdate(BaseModel):
    kind: Literal["person", "event", "category"]
    entity_ids: list[str]


class FaceOut(_FromAttrs):
    id: str
    file_id: str
    collection_id: str
    bbox: list = []
    score: float = 0.0
    person_id: str | None = None


class FaceInboxCluster(BaseModel):
    face_ids: list[str]
    faces: list[FaceOut]  # a few representatives for the UI
    count: int


class FileFace(BaseModel):
    """A detected face in a file, with its named person (if any) for the overlay."""

    id: str
    bbox: list = []
    score: float = 0.0
    person_id: str | None = None
    person_name: str | None = None
    person_color: str | None = None


class FaceAssign(BaseModel):
    face_ids: list[str]
    person_id: str | None = None  # assign to existing person…
    name: str | None = None  # …or create a new person with this name


# ── Search pipelines (static catalog) ──
class PipelineInfo(BaseModel):
    key: str
    label: str
    desc: str
    modality: str
    module: str | None  # ingest module its index depends on (None = always available)


class PipelinesOut(BaseModel):
    pipelines: list[PipelineInfo]
