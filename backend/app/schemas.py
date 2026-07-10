from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    username: str = Field(min_length=2, max_length=64)


class UserOut(BaseModel):
    id: str | None = None
    username: str
    email: str | None = None
    uuid: str  # legacy bearer (kept during the OAuth transition)


class ChunkAnchor(BaseModel):
    text_prefix: str  # first ~80 chars, used for Scroll-to-Text-Fragment
    text_suffix: str | None = None
    heading_path: list[str] = []  # ["H1 title", "H2 subsection", ...]


class ChunkIn(BaseModel):
    text: str
    anchor: ChunkAnchor
    position: int  # order within the page (0..n-1)


class PageIngest(BaseModel):
    url: str
    page_title: str
    chunks: list[ChunkIn]


class IngestResult(BaseModel):
    url: str
    ingested: int
    replaced: int  # chunks deleted from previous version of this page


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 10


class MatchedChunk(BaseModel):
    position: int
    score: float
    heading_path: list[str]
    text: str
    goto_url: str


class PageResult(BaseModel):
    url: str
    page_title: str
    best_score: float
    matched: list[MatchedChunk]  # sorted by score desc


class PageChunk(BaseModel):
    position: int
    text: str
    heading_path: list[str]


class PageContent(BaseModel):
    url: str
    page_title: str
    chunks: list[PageChunk]  # ordered by position
