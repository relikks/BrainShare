"""Content extraction + chunking for text-like files.

Uploaded documents (txt / md / pdf / epub / html / csv / json) are normalised to
**Markdown**, then split into token-bounded, structure-aware windows of ~512
tokens with 128 (¼) overlap — the retrieval sweet spot the chunking literature
converges on for most corpora. Each chunk keeps its exact character span in the
source markdown (and, for PDFs, its page) as `loc`, so search can jump to and
highlight the matching passage. Heavy media decoding (audio/video frames, ASR)
still happens Modal-side; the backend only deals with text here.
"""

from __future__ import annotations

import io
import logging
import math
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("brainshare.extractors")

# Research-backed defaults: 512-token windows, 128-token (¼) overlap.
TARGET_TOKENS = 512
OVERLAP_TOKENS = 128


# ── Token counting ─────────────────────────────────────────────────────────
# tiktoken (cl100k) is a fast, torch-free proxy for the embedding model's
# tokenizer — close enough for *sizing* windows (the semantic-window length is
# what matters, not the exact vocabulary). Degrades to a chars/4 heuristic if
# tiktoken isn't installed, so ingestion never hard-fails on a missing dep.
try:  # pragma: no cover - import guard
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        if not text:
            return 0
        return len(_ENC.encode(text, disallowed_special=()))

except Exception:  # noqa: BLE001 - tiktoken optional
    log.warning("tiktoken unavailable — using chars/4 token estimate for chunking")

    def count_tokens(text: str) -> int:
        return max(1, len(text) // 4) if text else 0


def decode_text(data: bytes, fallback: str = "") -> str:
    text = data.decode("utf-8", errors="ignore").strip()
    return text or fallback


# ── Chunk model ────────────────────────────────────────────────────────────
@dataclass
class Chunk:
    text: str
    start: int  # char offset into the source markdown (inclusive)
    end: int  # char offset (exclusive)
    index: int  # sequential chunk number
    page: int | None = None  # 1-based page for paged sources (PDF), else None


# ── Structure-aware, token-bounded splitter ────────────────────────────────
_PARA_SPLIT = re.compile(r"\n\s*\n")  # blank-line paragraph breaks
# Sentence-ish boundaries (Latin + CJK terminals) or a hard line break.
_SENT_SPLIT = re.compile(r"(?<=[.!?。！？…])\s+|\n")


def _atoms(text: str) -> list[tuple[str, int, int]]:
    """Paragraph atoms carrying their exact (start, end) char offsets in `text`."""
    out: list[tuple[str, int, int]] = []
    pos = 0
    for m in _PARA_SPLIT.finditer(text):
        seg = text[pos : m.start()]
        if seg.strip():
            out.append((seg, pos, m.start()))
        pos = m.end()
    tail = text[pos:]
    if tail.strip():
        out.append((tail, pos, len(text)))
    return out


def _sentences(seg: str, start: int) -> list[tuple[str, int, int]]:
    """Split one paragraph into sentence atoms, offsets relative to the source."""
    out: list[tuple[str, int, int]] = []
    pos = 0
    for m in _SENT_SPLIT.finditer(seg):
        s = seg[pos : m.start()]
        if s.strip():
            out.append((s, start + pos, start + m.start()))
        pos = m.end()
    tail = seg[pos:]
    if tail.strip():
        out.append((tail, start + pos, start + len(seg)))
    return out


def _hard_split(seg: str, start: int, target: int) -> list[tuple[str, int, int]]:
    """Last resort: a single sentence longer than the window — split by proportional
    char length into roughly token-sized pieces (keeps offsets exact)."""
    toks = count_tokens(seg)
    if toks <= target:
        return [(seg, start, start + len(seg))]
    parts = math.ceil(toks / target)
    size = max(1, math.ceil(len(seg) / parts))
    out: list[tuple[str, int, int]] = []
    for i in range(0, len(seg), size):
        piece = seg[i : i + size]
        if piece.strip():
            out.append((piece, start + i, start + i + len(piece)))
    return out


def _leaf_atoms(text: str, target: int) -> list[tuple[str, int, int]]:
    """Flatten to atoms that each fit the window: paragraphs, falling back to
    sentences, then hard char splits, only when a unit overflows `target`."""
    leaves: list[tuple[str, int, int]] = []
    for seg, s, e in _atoms(text):
        if count_tokens(seg) <= target:
            leaves.append((seg, s, e))
            continue
        for ss, sstart, send in _sentences(seg, s):
            if count_tokens(ss) <= target:
                leaves.append((ss, sstart, send))
            else:
                leaves.extend(_hard_split(ss, sstart, target))
    return leaves


def _page_for(offset: int, page_spans: list[tuple[int, int]] | None) -> int | None:
    """Page number whose span starts at or before `offset` (page_spans sorted by start)."""
    if not page_spans:
        return None
    page = None
    for start, no in page_spans:
        if start <= offset:
            page = no
        else:
            break
    return page


def chunk_markdown(
    text: str,
    *,
    target_tokens: int = TARGET_TOKENS,
    overlap_tokens: int = OVERLAP_TOKENS,
    page_spans: list[tuple[int, int]] | None = None,
) -> list[Chunk]:
    """Pack structure atoms into ~`target_tokens` windows with `overlap_tokens`
    of trailing overlap, snapped to paragraph/sentence boundaries. Offsets are
    exact into `text` so callers can highlight the source passage."""
    if not text or not text.strip():
        return []
    leaves = _leaf_atoms(text, target_tokens)
    if not leaves:
        return []
    counts = [count_tokens(s) for s, _, _ in leaves]

    chunks: list[Chunk] = []
    i, n, idx, last_end = 0, len(leaves), 0, -1
    while i < n:
        # Grow the window until the next atom would overflow (always take ≥1).
        j, tok = i, 0
        while j < n and (j == i or tok + counts[j] <= target_tokens):
            tok += counts[j]
            j += 1
        seg_start, seg_end = leaves[i][1], leaves[j - 1][2]
        # Next window start: back up so it re-includes ~overlap_tokens of the tail.
        # Bounded to k > i, so `i` always advances and the loop terminates.
        if j >= n:
            next_i = n
        else:
            k, back = j, 0
            while k > i + 1 and back < overlap_tokens:
                k -= 1
                back += counts[k]
            next_i = k
        # Emit unless this window ends inside already-covered text (a pure-overlap
        # window fully contained in the previous chunk adds nothing but noise).
        if seg_end > last_end:
            body = text[seg_start:seg_end].strip()
            if body:
                chunks.append(
                    Chunk(
                        text=body,
                        start=seg_start,
                        end=seg_end,
                        index=idx,
                        page=_page_for(seg_start, page_spans),
                    )
                )
                idx += 1
                last_end = seg_end
        i = next_i
    return chunks


# ── Multi-format → Markdown extraction ─────────────────────────────────────
def _pdf_to_md(data: bytes) -> tuple[str, list[tuple[int, int]]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    spans: list[tuple[int, int]] = []
    offset = 0
    for i, page in enumerate(reader.pages):
        spans.append((offset, i + 1))  # this page's text starts here
        block = ((page.extract_text() or "").strip()) + "\n\n"
        parts.append(block)
        offset += len(block)
    return "".join(parts).strip(), spans


def _epub_to_md(data: bytes) -> tuple[str, list[tuple[int, int]]]:
    import ebooklib
    from ebooklib import epub
    from markdownify import markdownify

    # ebooklib reads from a path, not bytes.
    with tempfile.NamedTemporaryFile(suffix=".epub", delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        book = epub.read_epub(tmp.name)
    parts: list[str] = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        html = item.get_content().decode("utf-8", errors="ignore")
        md = markdownify(html, heading_style="ATX").strip()
        if md:
            parts.append(md)
    return "\n\n".join(parts).strip(), []


def _html_to_md(data: bytes) -> tuple[str, list[tuple[int, int]]]:
    from markdownify import markdownify

    html = data.decode("utf-8", errors="ignore")
    return markdownify(html, heading_style="ATX").strip(), []


def to_markdown(data: bytes, name: str, mime: str = "") -> tuple[str, list[tuple[int, int]]]:
    """Normalise an uploaded text-like file to Markdown, returning (markdown,
    page_spans). page_spans maps a char offset → 1-based page (PDF only; [] otherwise).
    Any extractor failure (missing dep, corrupt file) degrades to a raw utf-8 decode
    so ingestion is never fatal — a garbled doc still indexes *something*."""
    ext = Path(name).suffix.lower()
    m = (mime or "").lower()
    try:
        if ext == ".pdf" or "pdf" in m:
            return _pdf_to_md(data)
        if ext == ".epub" or "epub" in m:
            return _epub_to_md(data)
        if ext in (".html", ".htm") or m.startswith("text/html"):
            return _html_to_md(data)
    except Exception:  # noqa: BLE001 - never let extraction kill ingestion
        log.warning("markdown extraction failed for %s; falling back to raw decode", name, exc_info=True)
    # txt / md / markdown / csv / json / rtf / unknown → the bytes already *are* text,
    # and plain text is valid Markdown (the "transcripts & .txt as .md" rule).
    return decode_text(data, name), []


# Back-compat shim: a few call sites still import chunk_text for a plain list[str].
def chunk_text(text: str, *, size: int = TARGET_TOKENS, overlap: int = OVERLAP_TOKENS) -> list[str]:
    return [c.text for c in chunk_markdown(text, target_tokens=size, overlap_tokens=overlap)]
