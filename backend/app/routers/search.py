from collections import defaultdict
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query

from .. import embeddings, vector_store
from ..auth import UserDep
from ..schemas import (
    MatchedChunk,
    PageChunk,
    PageContent,
    PageResult,
    SearchRequest,
)

router = APIRouter(tags=["search"])

# Pull more raw chunks than requested pages so we have enough material to
# group meaningfully — many top hits often belong to the same page.
PAGE_OVERSAMPLE = 6


def _build_goto_url(url: str, text_prefix: str, text_suffix: str | None) -> str:
    base = url.split("#", 1)[0]
    frag = f"#:~:text={quote(text_prefix)}"
    if text_suffix:
        frag += f",{quote(text_suffix)}"
    return base + frag


@router.post("/search", response_model=list[PageResult])
async def search(payload: SearchRequest, user_uuid: str = UserDep) -> list[PageResult]:
    qvec = await embeddings.embed_query(payload.query)
    raw_limit = max(payload.top_k * PAGE_OVERSAMPLE, payload.top_k)
    points = await vector_store.search(user_uuid, qvec, raw_limit)

    by_url: dict[str, list] = defaultdict(list)
    title_by_url: dict[str, str] = {}
    for p in points:
        pl = p.payload or {}
        url = pl.get("url", "")
        if not url:
            continue
        by_url[url].append(p)
        title_by_url.setdefault(url, pl.get("page_title", url))

    pages: list[PageResult] = []
    for url, hits in by_url.items():
        hits.sort(key=lambda x: x.score, reverse=True)
        pages.append(
            PageResult(
                url=url,
                page_title=title_by_url[url],
                best_score=hits[0].score,
                matched=[
                    MatchedChunk(
                        position=int(h.payload.get("position", 0)),
                        score=float(h.score),
                        heading_path=h.payload.get("heading_path", []),
                        text=h.payload.get("text", ""),
                        goto_url=_build_goto_url(
                            url,
                            h.payload.get("text_prefix", ""),
                            h.payload.get("text_suffix"),
                        ),
                    )
                    for h in hits
                ],
            )
        )

    pages.sort(key=lambda p: p.best_score, reverse=True)
    return pages[: payload.top_k]


@router.get("/page", response_model=PageContent)
async def get_page(
    url: str = Query(..., min_length=1),
    user_uuid: str = UserDep,
) -> PageContent:
    records = await vector_store.list_chunks_for_url(user_uuid, url)
    if not records:
        raise HTTPException(status_code=404, detail="Page not found for this user")
    records.sort(key=lambda r: int((r.payload or {}).get("position", 0)))
    page_title = (records[0].payload or {}).get("page_title", url)
    return PageContent(
        url=url,
        page_title=page_title,
        chunks=[
            PageChunk(
                position=int((r.payload or {}).get("position", 0)),
                text=(r.payload or {}).get("text", ""),
                heading_path=(r.payload or {}).get("heading_path", []),
            )
            for r in records
        ],
    )
