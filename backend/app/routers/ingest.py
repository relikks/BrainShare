from fastapi import APIRouter

from .. import embeddings, vector_store
from ..auth import UserDep
from ..schemas import IngestResult, PageIngest

router = APIRouter(tags=["ingest"])

# Google embeddings batch limit is conservative; chunk if needed.
EMBED_BATCH = 100


@router.post("/ingest", response_model=IngestResult)
async def ingest(payload: PageIngest, user_uuid: str = UserDep) -> IngestResult:
    replaced = await vector_store.delete_page(user_uuid, payload.url)

    chunks = payload.chunks
    if not chunks:
        return IngestResult(url=payload.url, ingested=0, replaced=replaced)

    texts = [c.text for c in chunks]
    vectors: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        vectors.extend(await embeddings.embed_documents(batch))

    payloads = []
    for c in chunks:
        section_title = c.anchor.heading_path[-1] if c.anchor.heading_path else payload.page_title
        payloads.append(
            {
                "text": c.text,
                "text_prefix": c.anchor.text_prefix,
                "text_suffix": c.anchor.text_suffix,
                "heading_path": c.anchor.heading_path,
                "section_title": section_title,
                "position": c.position,
            }
        )

    ingested = await vector_store.upsert_chunks(
        user_uuid=user_uuid,
        url=payload.url,
        page_title=payload.page_title,
        vectors=vectors,
        payloads=payloads,
    )
    return IngestResult(url=payload.url, ingested=ingested, replaced=replaced)
