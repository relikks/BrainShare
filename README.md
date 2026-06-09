# BrainShare

A collaborative **multi-modal knowledge drive + semantic second brain**. Create
**collections** (shared spaces), nest **directories**, and post **files of any
modality** (text, image, audio, video). Every file is embedded by the model that
fits its type, so the whole corpus is searchable in **natural language across any
combination of modalities** — globally or scoped to a single folder and its subtree.

```
web/ (Next.js + shader)  ─┐
extension/ (MV3)          ├─ HTTP (Bearer uuid) ─▶ backend/ (FastAPI)
                          ┘                          ├─ SQLite/Postgres  (tree + ACL)
                                                     ├─ Qdrant           (per-modality spaces)
                                                     └─ blobs
                                                         │ HTTPS
                                                         ▼
                                              modal/ (GPU inference)
                                       text · image · audio · video  (SOTA, scale-to-zero)
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, standards, and the
embedding-space / Modal-container design.

## Layout

| Dir | What |
|---|---|
| `backend/` | FastAPI + SQLModel + Qdrant. Collections/dirs/files, the embed pipeline, multi-modal search. |
| `modal/` | Modal app: 4 GPU embedder classes (Qwen3 · SigLIP2 · CLAP/WavLink+Whisper · X-CLIP), scale-to-zero. |
| `web/` | Next.js + `@drekis/shader` drive + search UI. |
| `extension/` | The original Chrome extension (kept; repointed later). |

## Run it

**1. Modal (GPU inference)** — token in `~/.modal.toml` (profile `relikks`):
```bash
cd modal && modal deploy app.py
```

**2. Backend** (dev uses SQLite + embedded Qdrant — no Docker needed):
```bash
cd backend
python -m venv .venv && . .venv/bin/activate && pip install -e .
uvicorn app.main:app --reload --port 8000      # http://localhost:8000/health
```
Set `EMBED_STUB=true` in `backend/.env` to run fully offline with deterministic
stub vectors (no Modal calls) — handy for UI work and tests.

**3. Web**:
```bash
cd web && pnpm install && pnpm dev             # http://localhost:4700
```
Open it, go to **Settings**, create an identity (username → UUID), then build
collections, upload files, and search.

## Search modes

- **Search** page — across all (or selected) collections, filtered by modality.
- **Browse** a collection — the "Search in this folder" box scopes to the current
  directory **and its whole subtree** (toggle off for this-folder-only). Backed by
  a materialized `ancestor_dir_ids` array on every chunk → exact, index-friendly,
  rename-safe subtree filtering.

## Notes

- **Dev vs prod stores**: SQLite + embedded Qdrant for dev; Postgres + served Qdrant
  in prod — connection strings only, code is store-agnostic.
- **Secrets** (Modal token, etc.) live only in gitignored `backend/.env` / `~/.modal.toml`.
