# BrainShare — Build plan: Shader web + feature completion (keep the Python backend)

**Decision (option a):** Shader for the **web**, **keep the Python/FastAPI backend**. The backend
already implements the app layer (users, collections, members+roles, ACL, chunk-level retrieval, the
swappable embedding registry, the pipeline, Qdrant, Modal). Re-platforming working Python to Java
(Shaper) would throw away good code and move away from the ML ecosystem the roadmap needs
(InsightFace/pyannote). So **Shaper is NOT used** — re-skin the web on Shader, extend Python for the
gaps. Live target: `brainshare-dev.drekis.com` (env-dev).

## What ALREADY exists (do NOT rebuild)
- **backend** (Python / FastAPI / SQLModel):
  - `services/`: users, collections, directories, files, **permissions** (`CollectionMember`,
    `Role` viewer/editor/owner, `require_member`, `accessible_collection_ids` ACL).
  - chunk-based ingest + search (`PageIngest`→`ChunkIn`→Qdrant; `MatchedChunk.goto_url` deep-link via
    Scroll-to-Text-Fragment anchors) → **granular retrieval already done**.
  - `embedding/registry.py` — **swappable models** (call Modal classes by name).
  - `pipeline/runner.py` — the indexing pipeline.
  - `models/entities.py` — stub for roadmap §2.
  - Qdrant `vector_store` (`_build_filter`), Modal client.
- **Modal `brainshare-embed`**: 4 GPU embedders autoscale-to-zero — text **Qwen3-Embedding-4B**,
  image **SigLIP2-so400m**, audio **CLAP**, video **X-CLIP**, **faster-whisper** transcripts. Weights
  in a Modal Volume. Models are constants → swap without touching the backend.
- **web** (Next.js): collections UI + a filter bar.
- **extension** (SIGSHARE): captures visited web pages into the corpus.

## Desired features → where they slot in
| Feature (the stated need) | Status | Plan |
|---|---|---|
| Google-Drive UX (collections / dirs / files) | partial (web) | **Shader web**: collection browser, file grid, dir tree, drag-drop upload, breadcrumb |
| Share collections with users | ✅ backend (members/roles/ACL) | **Shader**: share dialog (add member + role); the API already enforces it |
| Activate AI model **modules per collection** (vectors / OCR / image→text) | registry is global | **backend**: `collection_modules(collection_id, module, config, enabled)` + per-collection enable; **Shader** module panel |
| Intensive **filters by file type** | partial (roadmap §1) | **backend**: per-type metadata extraction → `files.meta` JSON + Qdrant payload + generic `filters:[{field,op,value}]` → Range/Match; **Shader** dynamic, type-aware filter bar |
| **Granular** semantic search | ✅ (chunks) | **Shader** search UX: results → matched chunks → jump (`goto_url`) |
| **Change the model / add a new model index** | registry exists | **backend**: enable-module → enqueue **reindex** through that module (named vector); **Shader** model picker in search |
| **Auto-index** new files | pipeline exists | **backend**: on file-add event → enqueue the runner for the collection's enabled modules |
| Entities (people / voices) | roadmap §2 stub | **Modal**: faces (InsightFace) + voices (pyannote) `@app.cls`; **backend** `entities`/`file_entities` + `entity_ids CONTAINS` filter; **Shader** tag + filter |

## Phases
- **F0 — Foundations (NOT a web rebuild — `web/` is ALREADY Next.js 16 + `@drekis/shader`).**
  - **SQLite → Postgres**: the backend is SQLModel on SQLite (`data/brainshare.db`). Point it at a real
    Postgres (its own, or the Supabase set up for CardForge — separate DB/schema). **This is the "simple
    postgres for users + collections" ask.** With SQLModel it's a connection-string + a migration
    (Alembic) + driver swap (`asyncpg`); the models barely change.
  - **Real multi-user auth**: today = localStorage + a seeded `relik` + `DEFAULT_UUID` fallback (every
    session is that user) + a Google-OAuth allow-list at the deploy. Wire real per-user identity so the
    existing `CollectionMember`/ACL sharing actually means something across users.
- **F1 — Modules per collection + metadata filters (§1).** Backend: `collection_modules`, metadata
  extractors (ffprobe/PIL or returned by the Modal embedders), Qdrant payload + generic `filters[]`.
  Shader: the per-collection module panel + the **dynamic, type-aware filter bar**.
- **F2 — Add-model-reindex + auto-index.** Backend: reindex job when a module is enabled; auto-enqueue
  on new files. Shader: model picker in search; index status per collection.
- **F3 — Entities (§2).** Modal face/voice models → backend entities + `entity_ids CONTAINS` →
  Shader tagging + people-filter + "who to ask" provenance.

## Infra / deploy notes
- **Modal**: `brainshare-embed` stays. The Python backend keeps calling it. (If any service ever goes
  Java, expose the Modal classes as `web_endpoint`s.)
- **Qdrant**: already the vector store. Use **named vectors per module** for the multi-modal/multi-model
  story (each chunk-point carries `text`/`image`/`ocr`/… vectors); adding a module = a new named vector.
- **Deploy**: clone → develop locally → env-dev `git pull` + build → `brainshare-dev.drekis.com`.
  Needs env-dev's **GitHub PAT** configured (pending — the repos are private + env-dev has no creds).
- **env-dev has uncommitted local tweaks**: `modal/app.py` (scaledown), `web/next.config.ts`,
  `web/src/lib/config.ts` + a `modal/app.py.bak-scaledown`. Reconcile/commit those before deploying so
  the working tree doesn't diverge.

## Start here (next session, fresh context)
1. **F0** — SQLite→Postgres (connection string + an Alembic migration + `asyncpg`; reconcile the env-dev
   uncommitted tweaks first so the working tree doesn't diverge) and real per-user auth. The web stays
   as-is (already `@drekis/shader`) — just re-point it at the updated API.
2. Then **F1** backend (`collection_modules` + per-type metadata) + the dynamic, type-aware filter bar
   in the existing Shader web.
3. **F2/F3** per the feature table above.
