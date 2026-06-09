# BrainShare — Project Contract

> Read this first. It defines what BrainShare is, how it's built, and the standards every change must hold. Keep it current: if you change the architecture, stack, or a load-bearing decision, update this file in the same commit.

---

## 1. North star

BrainShare is a **collaborative multi-modal knowledge drive + semantic second brain**. Users create **Collections** (shared root spaces), nest **Directories**, and post **Files of any modality** (text, image, audio, video today; 3D, proteins, … later). Every file is embedded by the **model appropriate to its modality**, so the whole corpus is searchable in **natural language across any chosen combination of modalities** via cosine similarity.

Two products in one: a **Google-Drive-for-people** (structure, share, collaborate) and a **second brain** (ask in plain language, get the exact file/segment back). The original Chrome **extension** remains one client of the same backend.

The guiding bet: knowledge transfer becomes radically easier when *any* artifact — a PDF, a lecture recording, a diagram, a screencast — is findable by meaning, not filename.

---

## 2. Architecture (the shape of the system)

```
            ┌────────────┐     ┌────────────┐
clients ──▶ │  web/ (UI) │     │ extension/ │
            └─────┬──────┘     └─────┬──────┘
                  │  HTTP (Bearer <uuid>)
            ┌─────▼───────────────────────────┐
            │ backend/  FastAPI                │
            │  routers → services → pipeline   │
            │  ├ SQLite/Postgres  (tree + ACL) │
            │  ├ Qdrant           (N spaces)   │
            │  └ blobs            (originals)  │
            └─────┬───────────────────────────┘
                  │ HTTPS (per-modality embed calls)
            ┌─────▼──────────────────────────┐
            │ modal/  GPU inference          │
            │  text · image · audio · video  │
            └────────────────────────────────┘
```

- **Storage is local** (SQLite/Postgres + embedded/served Qdrant + blob volume). **GPU inference is remote on Modal.** This split is deliberate: state stays cheap and local, heavy compute scales to zero.

### 2.1 Relational model (source of truth for the tree + permissions)
- `users` — `id`, `username`, `uuid` (the bearer key), `created_at`.
- `collections` — `id`, `owner_id`, `name`, `slug`, `created_at`. A collection is a root space.
- `collection_members` — `(collection_id, user_id, role)` where role ∈ `owner|editor|viewer`. **Sharing is by username.**
- `directories` — `id`, `collection_id`, `parent_id?`, `name`, `path` (materialized, for breadcrumbs).
- `files` — `id`, `collection_id`, `directory_id`, `owner_id`, `name`, `modality`, `mime`, `size`, `blob_key`, `status` (`pending|ready|failed`), timestamps.
- ORM: **SQLModel** (async). Migrations: **Alembic**. The schema is owned by migrations, never by `create_all` in prod.

### 2.2 Embedding spaces (one Qdrant collection per *space* — dims/spaces differ)
Every model carries a **text tower** so an NL query can land in each searched space. Model ids/dims are **config-driven** (`embedding/registry.py`), so they're swappable without touching call sites.

| Space | Model (open, SOTA) | Dim | Serves |
|---|---|---|---|
| `space_text` | Qwen3-Embedding (~1.5–4B) | ~2560 | text files, transcripts, text query |
| `space_image` | SigLIP 2 SO400M | 1152 | image files, image query |
| `space_audio` | WavLink (Whisper-based, also ASR) | ~512 | audio files, video audio, audio query |
| `space_video` | X-CLIP (temporal) | 512 | video visual, video query |

A **file fans out to one or more spaces**:
- text → `text`; image → `image`; audio → `audio` (+ transcript → `text`).
- **video → `video` (X-CLIP) + `audio` (track) + `text` (transcript)** — tri-signal fusion that closes the open-video quality gap.

Every Qdrant point payload carries: `file_id`, `collection_id`, `directory_id`, `file_modality`, `owner_id`, `segment` (chunk/window/frame-ts), and a preview anchor. Payload indices on `collection_id`, `file_modality`, `file_id`.

### 2.3 Pipeline (on create / edit / delete)
- **create/edit**: store blob + `files` row (`pending`) → enqueue job → modality extractor → Modal embed call(s) → upsert into each space → `ready`. **Edit = delete-by-`file_id` then re-embed.**
- **delete**: purge vectors (filter `file_id`) across all spaces + blob + row.
- MVP queue = in-process async worker with a status surface. For scale, swap to Arq/RQ behind the same interface — don't leak the queue choice into routers.

### 2.4 Search
Inputs: `query`, `modalities[]`, `collection_id?` (else all accessible), `directory_id?`, `top_k`.
1. Resolve **spaces** from selected modalities (video ⇒ video+audio+text; audio ⇒ audio+text).
2. Embed the query into each needed space (Modal `query` endpoints).
3. Query each space filtered by `collection_id ∈ accessible ∧ file_modality ∈ selected ∧ dir-scope`.
4. **Merge by `file_id`** (max-score across a file's vectors), normalize per-space, rank, return files + best segment + preview + modality badge.

### 2.5 Modal GPU strategy (cost-effective)
- **One `@modal.cls` per model** (`text`/`image`/`audio`/`video`), `min_containers=0`, short `scaledown_window`, weights loaded in `@modal.enter`. **Pay only for modalities actually used; scale to zero when idle.** Mostly T4; Qwen3-4B → L4.
- **Video adds no GPU model beyond X-CLIP** — its audio + transcript reuse the `audio`/`text` classes; fusion is backend orchestration.
- **Batch** chunks/frames/windows per call to cut GPU-seconds. The `video` class is swappable to a commercial API behind the same interface if open quality proves insufficient (config change only).

---

## 3. Repo layout (monorepo)

```
BrainShare/
  CLAUDE.md          # this file
  backend/  app/{models,routers,services,embedding,pipeline,storage}, vector_store.py, db.py, config.py, alembic/
  modal/    app.py (4 model classes) + deploy
  web/      Next.js + @drekis/shader  (drive + search UI)
  extension/ existing MV3 client (kept; repointed to new search later)
```

---

## 4. Stack

- **Backend**: Python 3.12, FastAPI, SQLModel (async), Alembic, Qdrant, pydantic v2. Tests: pytest + httpx.
- **Inference**: Modal (1.x). Models on HuggingFace `transformers` / model-specific libs. ffmpeg via `imageio-ffmpeg`/PyAV (pip, no system install).
- **Frontend**: Next.js (App Router) + **`@drekis/shader`** (the only UI kit) + Tailwind v4 + React 19.
- **Dev vs prod stores**: dev runs **SQLite + embedded Qdrant** (no docker/sudo needed in this env); prod runs **Postgres + served Qdrant**. Only the connection strings change — code is store-agnostic.

---

## 5. Code standards (non-negotiable)

### Python
- **Full type hints**; pass `ruff` + `mypy`. No bare `except`. Async I/O end-to-end (no sync DB/HTTP in request paths).
- **Thin routers**: routers validate + delegate. Logic lives in `services/` and `pipeline/`. DB access via `models/` + a repo/service layer, never raw SQL in routers.
- **Pydantic/SQLModel schemas** at every boundary; never return ORM objects raw.
- **One swap-point per concern**: `embedding/registry.py` (models), `storage/` (blobs), `vector_store.py` (spaces). Call sites depend on the interface, not the implementation. Keep `embeddings.py`'s single-touchpoint discipline (it's how Google → Modal stayed a one-file change).
- **Secrets only via env** (`config.Settings`). Never hardcode, never log, never commit. `.env` is gitignored.

### TypeScript / web
- **strict** TS, no `any`. **UI is `@drekis/shader` only** — no ad-hoc component libraries, no hand-rolled primitives when shader has one. Match the cardforge interface (sidebar shell, density, restraint).
- **Presentational components take data via props**; fetching lives in a typed `lib/api.ts` client. No secrets client-side (the UUID is the only credential, stored locally like the extension).
- Server components by default; `'use client'` only where needed.

### Cross-cutting
- **Migrations own the schema.** Any model change ships with an Alembic migration in the same commit.
- **Tests** for the pipeline (extract→embed→upsert) and search ranking; smoke-test new endpoints with httpx.
- **Comments explain *why***. Delete dead code. Smaller, simpler, fewer deps, better-documented.

---

## 6. Dev workflow

```bash
# backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000        # http://localhost:8000/health

# modal (GPU inference) — token in ~/.modal.toml (profile relikks)
cd modal && modal deploy app.py                  # then backend calls it via the SDK

# web
cd web && pnpm install && pnpm dev               # http://localhost:4700
```

Deploy the web app to the Drekis dev env via the `api` CLI on **port 4700** → `https://brainshare-dev.drekis.com` (see `/workspace/CLAUDE.md` for the deploy-key + `api` recipe).

---

## 7. Out of scope (for now)

- Real payments, org/team management beyond per-collection roles, native mobile apps.
- Non-MVP modalities (3D, proteins, …) — the registry/space design anticipates them; don't build them until asked.
- Replacing the local stores with managed services — keep the store-agnostic seam; don't hardwire a vendor.

---

## 8. Secrets & history note

The Modal token and a GitHub PAT were shared in plaintext during setup; they live only in gitignored config (`backend/.env`, `~/.modal.toml`) and must be **rotated**. Never echo them to logs or commits.
