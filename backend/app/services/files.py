from pathlib import Path

from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from .. import vector_store
from ..models import File, FileStatus, Modality
from ..storage import get_storage
from . import directories as dir_service

_EXT_MODALITY = {
    Modality.image: {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic"},
    Modality.audio: {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus"},
    Modality.video: {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"},
    Modality.text: {".txt", ".md", ".markdown", ".pdf", ".json", ".csv", ".html", ".rtf"},
}


def detect_modality(name: str, mime: str) -> Modality:
    m = (mime or "").lower()
    if m.startswith("image/"):
        return Modality.image
    if m.startswith("audio/"):
        return Modality.audio
    if m.startswith("video/"):
        return Modality.video
    if m.startswith("text/"):
        return Modality.text
    ext = Path(name).suffix.lower()
    for modality, exts in _EXT_MODALITY.items():
        if ext in exts:
            return modality
    return Modality.text


async def get(session: AsyncSession, collection_id: str, file_id: str) -> File:
    f = await session.get(File, file_id)
    if f is None or f.collection_id != collection_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return f


async def list_in_dir(
    session: AsyncSession, collection_id: str, directory_id: str | None
) -> list[File]:
    res = await session.exec(
        select(File)
        .where(File.collection_id == collection_id, File.directory_id == directory_id)
        .order_by(File.created_at)
    )
    return list(res.all())


async def create_file(
    session: AsyncSession,
    collection_id: str,
    owner_id: str,
    directory_id: str | None,
    name: str,
    mime: str,
    data: bytes,
) -> File:
    if directory_id:
        await dir_service.get(session, collection_id, directory_id)  # validates ownership
    f = File(
        collection_id=collection_id,
        directory_id=directory_id,
        owner_id=owner_id,
        name=name,
        modality=detect_modality(name, mime),
        mime=mime,
        size=len(data),
        status=FileStatus.pending,
    )
    f.blob_key = f"{collection_id}/{f.id}"
    await get_storage().put(f.blob_key, data)
    session.add(f)
    await session.commit()
    await session.refresh(f)
    return f


async def delete_file(session: AsyncSession, f: File) -> None:
    await vector_store.delete_file(f.id)
    await get_storage().delete(f.blob_key)
    await session.delete(f)
    await session.commit()
