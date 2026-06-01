import uuid as uuidlib
from typing import Iterable

from qdrant_client import AsyncQdrantClient, models

from .config import settings

_client = AsyncQdrantClient(
    url=settings.qdrant_url,
    api_key=settings.qdrant_api_key or None,
)


async def ensure_collection() -> None:
    collections = await _client.get_collections()
    names = {c.name for c in collections.collections}
    if settings.collection_name in names:
        return
    await _client.create_collection(
        collection_name=settings.collection_name,
        vectors_config=models.VectorParams(
            size=settings.embedding_dim,
            distance=models.Distance.COSINE,
        ),
    )
    # Payload indices for fast filtering.
    await _client.create_payload_index(
        collection_name=settings.collection_name,
        field_name="user_uuid",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    await _client.create_payload_index(
        collection_name=settings.collection_name,
        field_name="url",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )


async def delete_page(user_uuid: str, url: str) -> int:
    """Delete all chunks for a (user, url) pair. Returns approximate count."""
    flt = models.Filter(
        must=[
            models.FieldCondition(key="user_uuid", match=models.MatchValue(value=user_uuid)),
            models.FieldCondition(key="url", match=models.MatchValue(value=url)),
        ]
    )
    count = await _client.count(
        collection_name=settings.collection_name,
        count_filter=flt,
        exact=True,
    )
    await _client.delete(
        collection_name=settings.collection_name,
        points_selector=models.FilterSelector(filter=flt),
    )
    return count.count


async def upsert_chunks(
    user_uuid: str,
    url: str,
    page_title: str,
    vectors: list[list[float]],
    payloads: list[dict],
) -> int:
    points: list[models.PointStruct] = []
    for vec, payload in zip(vectors, payloads):
        points.append(
            models.PointStruct(
                id=str(uuidlib.uuid4()),
                vector=vec,
                payload={
                    "user_uuid": user_uuid,
                    "url": url,
                    "page_title": page_title,
                    **payload,
                },
            )
        )
    if not points:
        return 0
    await _client.upsert(
        collection_name=settings.collection_name,
        points=points,
        wait=True,
    )
    return len(points)


async def search(
    user_uuid: str,
    vector: list[float],
    top_k: int,
) -> list[models.ScoredPoint]:
    flt = models.Filter(
        must=[
            models.FieldCondition(
                key="user_uuid", match=models.MatchValue(value=user_uuid)
            )
        ]
    )
    res = await _client.query_points(
        collection_name=settings.collection_name,
        query=vector,
        query_filter=flt,
        limit=top_k,
        with_payload=True,
    )
    return res.points


async def list_chunks_for_url(user_uuid: str, url: str) -> list[models.Record]:
    """Scroll every chunk for a (user, url) pair, ordered by Qdrant insertion."""
    flt = models.Filter(
        must=[
            models.FieldCondition(key="user_uuid", match=models.MatchValue(value=user_uuid)),
            models.FieldCondition(key="url", match=models.MatchValue(value=url)),
        ]
    )
    out: list[models.Record] = []
    next_offset = None
    while True:
        points, next_offset = await _client.scroll(
            collection_name=settings.collection_name,
            scroll_filter=flt,
            limit=256,
            offset=next_offset,
            with_payload=True,
            with_vectors=False,
        )
        out.extend(points)
        if next_offset is None:
            break
    return out
