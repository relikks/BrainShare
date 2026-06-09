"""Blob storage swap-point. Local volume for dev; S3/R2 later behind the same ABC."""

from __future__ import annotations

import asyncio
import shutil
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path

from ..config import settings


class BlobStorage(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes) -> None: ...
    @abstractmethod
    async def get(self, key: str) -> bytes: ...
    @abstractmethod
    async def delete(self, key: str) -> None: ...
    @abstractmethod
    def local_path(self, key: str) -> str | None:
        """Filesystem path if the blob is local (lets ffmpeg/PIL read it directly)."""


class LocalBlobStorage(BlobStorage):
    def __init__(self, root: str) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        return self.root / key

    async def put(self, key: str, data: bytes) -> None:
        p = self._path(key)

        def _do() -> None:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)

        await asyncio.to_thread(_do)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        def _do() -> None:
            p = self._path(key)
            if p.exists():
                p.unlink()
            # prune now-empty collection dir
            parent = p.parent
            if parent.exists() and not any(parent.iterdir()):
                shutil.rmtree(parent, ignore_errors=True)

        await asyncio.to_thread(_do)

    def local_path(self, key: str) -> str | None:
        return str(self._path(key))


@lru_cache(maxsize=1)
def get_storage() -> BlobStorage:
    return LocalBlobStorage(settings.blob_dir)
