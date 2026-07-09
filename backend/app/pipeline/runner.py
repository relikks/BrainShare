"""Embedding pipeline: extract → embed (Modal) → upsert across spaces.

Runs as a background task on file create/edit. A file fans out to the spaces its
modality maps to (see embedding.registry); video fuses video+audio+transcript.
Each Qdrant point carries the full location (collection, ancestor dir ids, path)
so search can scope to any collection or directory subtree and show breadcrumbs.
"""

from __future__ import annotations

import io
import json
import logging
import subprocess
import tempfile
from pathlib import Path

from ..db import _session_factory
from ..embedding import get_embedder
from ..models import Collection, Directory, Face, File, FileStatus, Modality, new_id, utcnow
from ..modules import module_on
from ..storage import get_storage
from .. import vector_store
from .extractors import chunk_markdown, to_markdown

log = logging.getLogger("brainshare.pipeline")


def _ffprobe(data: bytes, name: str) -> dict:
    """Best-effort media metadata via ffprobe (duration / fps / dims / sample_rate / channels).
    Returns {} when ffmpeg is absent or the probe fails — metadata is optional, never fatal."""
    try:
        with tempfile.NamedTemporaryFile(suffix=Path(name).suffix, delete=True) as tmp:
            tmp.write(data)
            tmp.flush()
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json",
                 "-show_format", "-show_streams", tmp.name],
                capture_output=True, timeout=30,
            )
        if out.returncode != 0:
            return {}
        info = json.loads(out.stdout)
    except Exception:  # noqa: BLE001 — ffmpeg may be missing; degrade gracefully
        return {}
    meta: dict = {}
    dur = info.get("format", {}).get("duration")
    if dur:
        meta["duration_s"] = round(float(dur), 2)
    for s in info.get("streams", []):
        if s.get("codec_type") == "video":
            if s.get("width"):
                meta["width"] = s["width"]
            if s.get("height"):
                meta["height"] = s["height"]
            rate = s.get("r_frame_rate", "")
            if "/" in rate:
                n, d = rate.split("/")
                if float(d or 0):
                    meta["fps"] = round(float(n) / float(d), 2)
        elif s.get("codec_type") == "audio":
            if s.get("sample_rate"):
                meta["sample_rate"] = int(s["sample_rate"])
            if s.get("channels"):
                meta["channels"] = s["channels"]
    return meta


def _extract_meta(modality: Modality, data: bytes, name: str, text: str | None = None) -> dict:
    """Per-type structured metadata for §1 filters. Best-effort — must never raise."""
    meta: dict = {"size_bytes": len(data)}
    try:
        if modality is Modality.image:
            from PIL import Image  # pillow is a dependency

            with Image.open(io.BytesIO(data)) as im:
                w, h = im.size
                meta["width"], meta["height"] = w, h
                if h:
                    meta["aspect"] = round(w / h, 4)
                meta["orientation"] = (
                    "landscape" if w > h else "portrait" if h > w else "square"
                )
        elif modality is Modality.text and text is not None:
            meta["word_count"] = len(text.split())
            meta["char_count"] = len(text)
        elif modality in (Modality.audio, Modality.video):
            meta.update(_ffprobe(data, name))
    except Exception:  # noqa: BLE001 — metadata is best-effort, must not fail the embed
        log.warning("metadata extraction failed for %s", name, exc_info=True)
    return meta


def _point(vec: list[float], base: dict, **extra) -> dict:
    return {"id": new_id(), "vector": vec, "payload": {**base, **extra}}


async def process_file(file_id: str) -> None:
    async with _session_factory() as session:
        f = await session.get(File, file_id)
        if f is None:
            return
        try:
            await _embed(session, f)
            failed = [k for k, v in (f.index_status or {}).items() if v == "failed"]
            ready = [k for k, v in (f.index_status or {}).items() if v == "ready"]
            # A file is ready if anything indexed; failed only when every attempted step failed.
            if failed and not ready:
                f.status, f.error = FileStatus.failed, f"{', '.join(failed)} failed"
            else:
                f.status = FileStatus.ready
                f.error = f"partial: {', '.join(failed)} failed" if failed else None
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

    # §1 — per-type metadata → File.meta + stamped into every point's payload (search filters on it).
    # Text files are normalised to Markdown up front (pdf/epub/html → md; txt/md already
    # are). page_spans carries per-page offsets (PDF) so chunks can record their page.
    text_md: str | None = None
    page_spans: list[tuple[int, int]] = []
    if f.modality is Modality.text:
        text_md, page_spans = to_markdown(data, f.name, f.mime)
    f.meta = _extract_meta(f.modality, data, f.name, text_md)
    base["meta"] = f.meta

    emb = get_embedder()
    await vector_store.delete_file(f.id)  # idempotent re-embed (edit path)

    # Each ingest step feeds exactly one search pipeline (embedding.registry.PIPELINES)
    # and is gated on the collection's enabled modules (defaults in app/modules.py).
    # Steps are isolated: one failing never takes down the rest (partial index > none),
    # and each records its state in File.index_status so search can gate on it.
    status: dict[str, str] = {}

    async def step(pipeline: str, module: str | None, fn) -> None:
        if module is not None and not module_on(coll, module):
            status[pipeline] = "off"
            return
        try:
            await fn()
            status[pipeline] = "ready"
        except Exception:  # noqa: BLE001 — isolated; file-level status derived by caller
            log.exception("ingest step %s failed for file %s", pipeline, f.id)
            status[pipeline] = "failed"

    if f.modality is Modality.text:
        await step(
            "text.semantic",
            None,
            lambda: _embed_text_chunks(emb, base, text_md or "", page_spans=page_spans),
        )

    elif f.modality is Modality.image:
        # Objects first: its caption/tags land in File.meta before the visual point is
        # stamped, so every point's payload carries them (filters + explainability).
        async def _objects() -> None:
            desc = (await emb.describe_image([data]))[0]
            tags = [t for t in (desc.get("tags") or []) if t]
            objects = desc.get("objects") or []  # [{label,bbox,score}] — boxes for the overlay
            # Persist tags + object boxes even if there are no tags (still record objects=[]).
            f.meta = {**f.meta, "tags": tags, "objects": objects}
            base["meta"] = f.meta
            if not tags:
                return
            doc = ", ".join(tags)
            vec = (await emb.embed_text([doc]))[0]
            await vector_store.upsert(
                "image_objects", [_point(vec, base, segment="objects", text=doc)]
            )

        async def _visual() -> None:
            vec = (await emb.embed_image([data]))[0]
            await vector_store.upsert("image", [_point(vec, base, segment="image", text=f.name)])

        async def _faces() -> None:
            # Re-embed path: drop this file's stale Face rows first (Qdrant points are
            # already purged by delete_file at the top of _embed).
            from sqlmodel import delete as _delete

            await session.exec(_delete(Face).where(Face.file_id == f.id))

            faces = (await emb.detect_faces([data]))[0]
            f.meta = {**f.meta, "face_count": len(faces), "faces": [{"bbox": fc["bbox"]} for fc in faces]}
            base["meta"] = f.meta
            if not faces:
                return
            # One point per face in the `face` space (vector = ArcFace embedding) + a Face
            # row carrying its box and (later) the person it's assigned to.
            pts = []
            for i, fc in enumerate(faces):
                if not fc.get("embedding"):
                    continue
                pt = _point(fc["embedding"], base, segment=f"face-{i}", bbox=fc["bbox"], face_score=fc["score"])
                pts.append(pt)
                session.add(
                    Face(
                        file_id=f.id,
                        collection_id=f.collection_id,
                        point_id=pt["id"],
                        bbox=fc["bbox"],
                        score=fc["score"],
                    )
                )
            if pts:
                await vector_store.upsert("face", pts)

        await step("image.objects", "objects", _objects)
        await step("image.description", "image", _visual)
        await step("image.faces", "faces", _faces)

    elif f.modality is Modality.audio:
        async def _sound() -> None:
            avec = (await emb.embed_audio([data]))[0]
            await vector_store.upsert("audio", [_point(avec, base, segment="audio", text=f.name)])

        async def _transcript() -> None:
            await _embed_text_chunks(emb, base, await emb.transcribe(data), label="transcript")

        await step("audio.sound", "audio", _sound)
        await step("audio.transcript", "transcription", _transcript)

    elif f.modality is Modality.video:
        async def _visual() -> None:
            vvec = (await emb.embed_video([data]))[0]
            await vector_store.upsert("video", [_point(vvec, base, segment="video", text=f.name)])

        async def _soundtrack() -> None:
            avec = (await emb.embed_audio([data]))[0]
            await vector_store.upsert("audio", [_point(avec, base, segment="audio-track", text=f.name)])

        async def _transcript() -> None:
            await _embed_text_chunks(emb, base, await emb.transcribe(data), label="transcript")

        await step("video.visual", "video", _visual)
        await step("video.soundtrack", "audio", _soundtrack)
        await step("video.transcript", "transcription", _transcript)

    f.index_status = status  # assignment (not mutation) so the JSON column is flagged dirty


async def _embed_text_chunks(
    emb, base: dict, text: str, *, label: str = "chunk", page_spans: list[tuple[int, int]] | None = None
) -> None:
    """Chunk markdown/transcript into 512-token windows (128 overlap) and embed each,
    stamping its source span (and page, for PDFs) as `loc` so search can highlight."""
    chunks = chunk_markdown(text, page_spans=page_spans)
    if not chunks:
        return
    vecs = await emb.embed_text([c.text for c in chunks])
    points = []
    for c, v in zip(chunks, vecs):
        loc: dict = {"start": c.start, "end": c.end}
        if c.page is not None:
            loc["page"] = c.page
        points.append(_point(v, base, segment=f"{label}-{c.index}", text=c.text, loc=loc))
    await vector_store.upsert("text", points)
