"""Objects-only reingest: recompute YOLOE+SigLIP tags/objects for existing images,
update the denormalized meta on every point, re-embed the image_objects vector.
Leaves face rows + person assignments untouched (unlike a full reindex)."""
import asyncio

from qdrant_client import models

from app import vector_store
from app.db import _session_factory
from app.embedding import get_embedder
from app.models import Collection, Directory, File, Modality
from app.pipeline.runner import _point
from app.storage import get_storage
from sqlmodel import select


async def reobjects(session, emb, f: File) -> str:
    coll = await session.get(Collection, f.collection_id)
    directory = await session.get(Directory, f.directory_id) if f.directory_id else None
    data = await get_storage().get(f.blob_key)
    desc = (await emb.describe_image([data]))[0]
    tags = [t for t in (desc.get("tags") or []) if t]
    objects = desc.get("objects") or []
    f.meta = {**(f.meta or {}), "tags": tags, "objects": objects}
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
        "meta": f.meta,
    }
    client = vector_store._get_client()
    flt = vector_store._build_filter(file_id=f.id)
    names = {c.name for c in client.get_collections().collections}
    # 1) refresh denormalized meta on ALL of this file's points (image/objects/face)
    for space in ("image", "image_objects", "face"):
        if vector_store._coll(space) in names:
            client.set_payload(
                collection_name=vector_store._coll(space),
                payload={"meta": f.meta},
                points=models.FilterSelector(filter=flt),
            )
    # 2) replace the image_objects vector (its doc text changed)
    if vector_store._coll("image_objects") in names:
        client.delete(
            collection_name=vector_store._coll("image_objects"),
            points_selector=models.FilterSelector(filter=flt),
        )
    if tags:
        doc = ", ".join(tags)
        vec = (await emb.embed_text([doc]))[0]
        await vector_store.upsert("image_objects", [_point(vec, base, segment="objects", text=doc)])
    session.add(f)
    await session.commit()
    return "{}: {} objs, tags: {}".format(f.name, len(objects), ", ".join(tags[:8]))


async def main():
    emb = get_embedder()
    async with _session_factory() as session:
        files = (await session.exec(select(File).where(File.modality == Modality.image))).all()
        print("reingesting", len(files), "images (objects only)...", flush=True)
        for f in files:
            try:
                print("  " + await reobjects(session, emb, f), flush=True)
            except Exception as e:
                print("  FAIL {}: {}".format(f.name, e), flush=True)


asyncio.run(main())
