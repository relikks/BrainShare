"""Multi-space vector store over Qdrant.

One Qdrant collection per embedding space (`space_<name>`). Embedded local mode
(path) for dev, served mode (url) for prod — the rest of the app never knows.
The Qdrant local client is sync, so every call is offloaded with `to_thread`.

Directory scoping uses a materialized ancestor array: each point carries
`ancestor_dir_ids` (root→own-folder), so "this folder and everything under it"
is the single exact filter `ancestor_dir_ids CONTAINS <dirId>`.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Iterable, Sequence

from qdrant_client import QdrantClient, models

from .config import settings
from .embedding.registry import SPACES
from .models import Modality

_client: QdrantClient | None = None
_ensured: set[str] = set()


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        if settings.qdrant_url:
            _client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
        else:
            Path(settings.qdrant_path or "./data/qdrant").mkdir(parents=True, exist_ok=True)
            _client = QdrantClient(path=settings.qdrant_path)
    return _client


def _coll(space: str) -> str:
    return f"space_{space}"


_INDEXED = ("collection_id", "file_modality", "file_id", "directory_id", "ancestor_dir_ids")


def _ensure_sync(space: str, dim: int) -> None:
    name = _coll(space)
    if name in _ensured:
        return
    client = _get_client()
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
        )
        # Payload indexes only matter (and are only supported) in served Qdrant;
        # local/embedded mode filters by scan, so skip them to avoid noise.
        if settings.qdrant_url:
            for field in _INDEXED:
                client.create_payload_index(
                    collection_name=name,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
    _ensured.add(name)


async def ensure_space(space: str, dim: int) -> None:
    await asyncio.to_thread(_ensure_sync, space, dim)


async def upsert(space: str, points: Sequence[dict[str, Any]]) -> int:
    """points: [{"id": str, "vector": list[float], "payload": dict}, ...]."""
    pts = [p for p in points if p.get("vector")]
    if not pts:
        return 0
    await ensure_space(space, len(pts[0]["vector"]))
    structs = [
        models.PointStruct(id=p["id"], vector=p["vector"], payload=p["payload"]) for p in pts
    ]

    def _do() -> None:
        _get_client().upsert(collection_name=_coll(space), points=structs, wait=True)

    await asyncio.to_thread(_do)
    return len(structs)


def _build_filter(
    *,
    collection_ids: Iterable[str] | None = None,
    modalities: Iterable[Modality] | None = None,
    file_id: str | None = None,
    file_ids: Iterable[str] | None = None,
    ancestor_dir_id: str | None = None,
    directory_id: str | None = None,
    meta_filters: Iterable[Any] | None = None,
) -> models.Filter | None:
    must: list[models.Condition] = []
    if collection_ids:
        must.append(
            models.FieldCondition(
                key="collection_id", match=models.MatchAny(any=list(collection_ids))
            )
        )
    if modalities:
        must.append(
            models.FieldCondition(
                key="file_modality", match=models.MatchAny(any=[str(m) for m in modalities])
            )
        )
    if file_id:
        must.append(models.FieldCondition(key="file_id", match=models.MatchValue(value=file_id)))
    if file_ids is not None:
        # Restrict to a specific set of files (e.g. those linked to a person).
        must.append(models.FieldCondition(key="file_id", match=models.MatchAny(any=list(file_ids))))
    if ancestor_dir_id:
        # array-contains: matches points whose ancestor_dir_ids includes this id.
        must.append(
            models.FieldCondition(
                key="ancestor_dir_ids", match=models.MatchValue(value=ancestor_dir_id)
            )
        )
    if directory_id:
        must.append(
            models.FieldCondition(key="directory_id", match=models.MatchValue(value=directory_id))
        )
    # §1 — generic, type-aware metadata filters on payload `meta.<field>` (duck-typed MetaFilter).
    for f in meta_filters or ():
        key = f"meta.{f.field}"
        if f.op == "in":
            must.append(models.FieldCondition(key=key, match=models.MatchAny(any=list(f.value))))
        elif f.op in ("gte", "lte", "gt", "lt"):
            must.append(models.FieldCondition(key=key, range=models.Range(**{f.op: f.value})))
        else:  # eq
            must.append(models.FieldCondition(key=key, match=models.MatchValue(value=f.value)))
    return models.Filter(must=must) if must else None


async def get_vectors(space: str, ids: Sequence[str]) -> dict[str, list[float]]:
    """Fetch the raw vectors for the given point ids (face clustering)."""
    name = _coll(space)

    def _do() -> dict[str, list[float]]:
        client = _get_client()
        if not ids or name not in {c.name for c in client.get_collections().collections}:
            return {}
        pts = client.retrieve(collection_name=name, ids=list(ids), with_vectors=True)
        return {str(p.id): list(p.vector) for p in pts if p.vector is not None}

    return await asyncio.to_thread(_do)


async def search(
    space: str,
    vector: list[float],
    *,
    top_k: int,
    collection_ids: Iterable[str] | None = None,
    modalities: Iterable[Modality] | None = None,
    file_ids: Iterable[str] | None = None,
    ancestor_dir_id: str | None = None,
    directory_id: str | None = None,
    meta_filters: Iterable[Any] | None = None,
) -> list[models.ScoredPoint]:
    name = _coll(space)
    flt = _build_filter(
        collection_ids=collection_ids,
        modalities=modalities,
        file_ids=file_ids,
        ancestor_dir_id=ancestor_dir_id,
        directory_id=directory_id,
        meta_filters=meta_filters,
    )

    def _do() -> list[models.ScoredPoint]:
        client = _get_client()
        if name not in {c.name for c in client.get_collections().collections}:
            return []
        return client.query_points(
            collection_name=name,
            query=vector,
            query_filter=flt,
            limit=top_k,
            with_payload=True,
        ).points

    return await asyncio.to_thread(_do)


async def scroll(
    space: str,
    *,
    limit: int,
    collection_ids: Iterable[str] | None = None,
    modalities: Iterable[Modality] | None = None,
    file_ids: Iterable[str] | None = None,
    ancestor_dir_id: str | None = None,
    directory_id: str | None = None,
    meta_filters: Iterable[Any] | None = None,
) -> list[models.Record]:
    """Filter-only retrieval (no query vector) — the points matching the filter, used
    for query-less "apply filters" search where membership, not relevance, is the answer."""
    name = _coll(space)
    flt = _build_filter(
        collection_ids=collection_ids,
        modalities=modalities,
        file_ids=file_ids,
        ancestor_dir_id=ancestor_dir_id,
        directory_id=directory_id,
        meta_filters=meta_filters,
    )

    def _do() -> list[models.Record]:
        client = _get_client()
        if name not in {c.name for c in client.get_collections().collections}:
            return []
        recs, _ = client.scroll(
            collection_name=name,
            scroll_filter=flt,
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )
        return recs

    return await asyncio.to_thread(_do)


async def delete_file(file_id: str) -> None:
    """Purge every vector for a file across all spaces (edit/delete path)."""
    flt = _build_filter(file_id=file_id)

    def _do() -> None:
        client = _get_client()
        names = {c.name for c in client.get_collections().collections}
        for space in SPACES:
            if _coll(space) in names:
                client.delete(
                    collection_name=_coll(space),
                    points_selector=models.FilterSelector(filter=flt),
                )

    await asyncio.to_thread(_do)


async def restamp_location(
    file_id: str, *, ancestor_dir_ids: list[str], dir_path: str, directory_id: str | None
) -> None:
    """On directory move/rename, update a file's location payload in place."""
    flt = _build_filter(file_id=file_id)
    payload = {
        "ancestor_dir_ids": ancestor_dir_ids,
        "dir_path": dir_path,
        "directory_id": directory_id,
    }

    def _do() -> None:
        client = _get_client()
        names = {c.name for c in client.get_collections().collections}
        for space in SPACES:
            if _coll(space) in names:
                client.set_payload(
                    collection_name=_coll(space),
                    payload=payload,
                    points=models.FilterSelector(filter=flt),
                )

    await asyncio.to_thread(_do)
