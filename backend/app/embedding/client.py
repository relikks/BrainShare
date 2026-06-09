"""The embedding swap-point. Call sites depend on `get_embedder()`, never on Modal.

Two implementations:
- ModalEmbedder  — calls the deployed `brainshare-embed` Modal functions (prod path).
- StubEmbedder   — deterministic local vectors (offline dev/tests; identical input
                   → identical unit vector, so text self-search verifies the wiring).
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from functools import lru_cache

import numpy as np

from ..config import settings
from .registry import SPACES

Vec = list[float]


class Embedder(ABC):
    @abstractmethod
    async def embed_text(self, texts: list[str], *, query: bool = False) -> list[Vec]: ...
    @abstractmethod
    async def embed_image(self, images: list[bytes]) -> list[Vec]: ...
    @abstractmethod
    async def embed_image_query(self, texts: list[str]) -> list[Vec]: ...
    @abstractmethod
    async def embed_audio(self, clips: list[bytes]) -> list[Vec]: ...
    @abstractmethod
    async def embed_audio_query(self, texts: list[str]) -> list[Vec]: ...
    @abstractmethod
    async def embed_video(self, clips: list[bytes]) -> list[Vec]: ...
    @abstractmethod
    async def embed_video_query(self, texts: list[str]) -> list[Vec]: ...
    @abstractmethod
    async def transcribe(self, clip: bytes) -> str: ...

    async def query_vector(self, space: str, text: str) -> Vec:
        """Embed an NL query into a given space via that space's text tower."""
        if space == "text":
            return (await self.embed_text([text], query=True))[0]
        if space == "image":
            return (await self.embed_image_query([text]))[0]
        if space == "audio":
            return (await self.embed_audio_query([text]))[0]
        if space == "video":
            return (await self.embed_video_query([text]))[0]
        raise ValueError(f"unknown space {space!r}")


def _unit(seed_bytes: bytes, dim: int) -> Vec:
    h = hashlib.sha256(seed_bytes).digest()
    rng = np.random.default_rng(int.from_bytes(h[:8], "little"))
    v = rng.standard_normal(dim)
    v /= np.linalg.norm(v) or 1.0
    return v.astype(float).tolist()


class StubEmbedder(Embedder):
    """Deterministic vectors. Text doc/query of identical text collide (cosine 1)."""

    async def embed_text(self, texts: list[str], *, query: bool = False) -> list[Vec]:
        d = SPACES["text"].dim
        return [_unit(("t:" + t.strip().lower()).encode(), d) for t in texts]

    async def _native(self, space: str, blobs: list[bytes]) -> list[Vec]:
        d = SPACES[space].dim
        return [_unit(space.encode() + b, d) for b in blobs]

    async def embed_image(self, images: list[bytes]) -> list[Vec]:
        return await self._native("image", images)

    async def embed_image_query(self, texts: list[str]) -> list[Vec]:
        d = SPACES["image"].dim
        return [_unit(("image:" + t.strip().lower()).encode(), d) for t in texts]

    async def embed_audio(self, clips: list[bytes]) -> list[Vec]:
        return await self._native("audio", clips)

    async def embed_audio_query(self, texts: list[str]) -> list[Vec]:
        d = SPACES["audio"].dim
        return [_unit(("audio:" + t.strip().lower()).encode(), d) for t in texts]

    async def embed_video(self, clips: list[bytes]) -> list[Vec]:
        return await self._native("video", clips)

    async def embed_video_query(self, texts: list[str]) -> list[Vec]:
        d = SPACES["video"].dim
        return [_unit(("video:" + t.strip().lower()).encode(), d) for t in texts]

    async def transcribe(self, clip: bytes) -> str:
        return ""


class ModalEmbedder(Embedder):
    """Calls the deployed Modal model classes by name (token in ~/.modal.toml/env)."""

    def __init__(self, app_name: str) -> None:
        self.app_name = app_name
        self._inst: dict[str, object] = {}

    def _cls(self, name: str):
        import modal

        if name not in self._inst:
            self._inst[name] = modal.Cls.from_name(self.app_name, name)()
        return self._inst[name]

    async def embed_text(self, texts: list[str], *, query: bool = False) -> list[Vec]:
        mode = "query" if query else "document"
        return await self._cls("TextEmbedder").embed.remote.aio(texts, mode)

    async def embed_image(self, images: list[bytes]) -> list[Vec]:
        return await self._cls("ImageEmbedder").embed.remote.aio(images, "image")

    async def embed_image_query(self, texts: list[str]) -> list[Vec]:
        return await self._cls("ImageEmbedder").embed.remote.aio(texts, "text")

    async def embed_audio(self, clips: list[bytes]) -> list[Vec]:
        return await self._cls("AudioEmbedder").embed.remote.aio(clips, "audio")

    async def embed_audio_query(self, texts: list[str]) -> list[Vec]:
        return await self._cls("AudioEmbedder").embed.remote.aio(texts, "text")

    async def embed_video(self, clips: list[bytes]) -> list[Vec]:
        return await self._cls("VideoEmbedder").embed.remote.aio(clips, "video")

    async def embed_video_query(self, texts: list[str]) -> list[Vec]:
        return await self._cls("VideoEmbedder").embed.remote.aio(texts, "text")

    async def transcribe(self, clip: bytes) -> str:
        return await self._cls("AudioEmbedder").transcribe.remote.aio(clip)


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    if settings.embed_stub:
        return StubEmbedder()
    return ModalEmbedder(settings.modal_app_name)
