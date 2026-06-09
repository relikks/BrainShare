"""Content extraction helpers. Heavy media decoding (audio/video frames, ASR)
happens Modal-side from raw bytes; the backend only needs text chunking."""

from __future__ import annotations

CHUNK = 800
OVERLAP = 120


def decode_text(data: bytes, fallback: str = "") -> str:
    text = data.decode("utf-8", errors="ignore").strip()
    return text or fallback


def chunk_text(text: str, *, size: int = CHUNK, overlap: int = OVERLAP) -> list[str]:
    """Char windows with overlap, snapped to a nearby whitespace when possible."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        if end < n:
            ws = text.rfind(" ", start + size - overlap, end)
            if ws != -1 and ws > start:
                end = ws
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
