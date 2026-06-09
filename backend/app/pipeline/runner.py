"""Embedding pipeline: extract → embed (Modal) → upsert across spaces.

Runs as a background task on file create/edit. A file fans out to the spaces its
modality maps to (see embedding.registry); video fuses video+audio+transcript.
Each Qdrant point carries the full location (collection, ancestor dir ids, path)
so search can scope to any collection or directory subtree and show breadcrumbs.
"""

from __future__ import annotations

import logging

from ..db import _session_factory
from ..embedding import get_embedder
from ..models import Collection, Directory, File, FileStatus, Modality, new_id, utcnow
from ..storage import get_storage
from .. import vector_store
from .extractors import chunk_text, decode_text

log = logging.getLogger("brainshare.pipeline")


def _point(vec: list[float], base: dict, **extra) -> dict:
    return {"id": new_id(), "vector": vec, "payload": {**base, **extra}}


async def process_file(file_id: str) -> None:
    async with _session_factory() as session:
        f = await session.get(File, file_id)
        if f is None:
            return
        try:
            await _embed(session, f)
            f.status, f.error = FileStatus.ready, None
        except Exception as exc:  # noqa: BLE001 — surface failure on the file row
            log.exception("embedding failed for file %s", file_id)
            f.status, f.error = FileStatus.failed, str(exc)[:500]
        f.updated_at = utcnow()
        session.add(f)
        await session.commit()


async def _embed(session, f: File) -> None:
    coll = await session.get(Collection, f.collection_id)
    directory = await session.get(Directory, f.directory_id) if f.directory_id else None
    base = {
        "file_id": f.id,
        "collection_id": f.collection_id,
        "collection_name": coll.name if coll else "",
        "file_name": f.name,
        "file_modality": str(f.modality),
        "owner_id": f.owner_id,
        "directory_id": f.directory_id,
        "ancestor_dir_ids": directory.ancestor_ids if directory else [],
        "dir_path": directory.path if directory else "/",
    }

    data = await get_storage().get(f.blob_key)
    emb = get_embedder()
    await vector_store.delete_file(f.id)  # idempotent re-embed (edit path)

    if f.modality is Modality.text:
        await _embed_transcript_or_text(emb, base, decode_text(data, f.name))

    elif f.modality is Modality.image:
        vec = (await emb.embed_image([data]))[0]
        await vector_store.upsert("image", [_point(vec, base, segment="image", text=f.name)])

    elif f.modality is Modality.audio:
        avec = (await emb.embed_audio([data]))[0]
        await vector_store.upsert("audio", [_point(avec, base, segment="audio", text=f.name)])
        await _embed_transcript_or_text(emb, base, await emb.transcribe(data), label="transcript")

    elif f.modality is Modality.video:
        vvec = (await emb.embed_video([data]))[0]
        await vector_store.upsert("video", [_point(vvec, base, segment="video", text=f.name)])
        avec = (await emb.embed_audio([data]))[0]
        await vector_store.upsert("audio", [_point(avec, base, segment="audio-track", text=f.name)])
        await _embed_transcript_or_text(emb, base, await emb.transcribe(data), label="transcript")


async def _embed_transcript_or_text(emb, base: dict, text: str, label: str = "chunk") -> None:
    chunks = chunk_text(text)
    if not chunks:
        return
    vecs = await emb.embed_text(chunks)
    points = [
        _point(v, base, segment=f"{label}-{i}", text=chunks[i]) for i, v in enumerate(vecs)
    ]
    await vector_store.upsert("text", points)
