# Personal Corpus

Chrome extension + FastAPI backend that lets you build a private, searchable corpus from the web pages you visit. One click saves the active page; one query searches across everything you've saved; "Go to" jumps back to the exact section using Chrome's native Scroll-to-Text-Fragment.

```
[Chrome Extension] ──── Bearer <uuid> ────▶ [FastAPI] ──▶ [Qdrant]
                                                │
                                                └──▶ Google embeddings
```

## End-to-end test path

### 1. Backend

```powershell
cd C:\Users\dsan\rag-extension\backend
docker compose up -d                       # Qdrant on :6333
copy .env.example .env                     # GOOGLE_API_KEY is auto-picked from
                                           # C:/Users/dsan/Documents/scripts/.env
uv sync                                    # or: pip install -e .
uv run uvicorn app.main:app --reload --port 8000
```

Sanity check: `curl http://localhost:8000/health` → `{"status":"ok"}`.

### 2. Extension

```powershell
cd C:\Users\dsan\rag-extension\extension
npm install
npm run build                              # outputs ./dist
```

Then in Chrome:
1. `chrome://extensions` → enable Developer mode
2. **Load unpacked** → select `extension/dist`
3. Pin the extension from the puzzle icon

### 3. Smoke flow

1. Click the extension icon. First run shows the Setup screen.
2. Endpoint = `http://localhost:8000`. Type a username, **Generate UUID**.
3. Copy the UUID (it's the only credential — there's no recovery).
4. Open any article page (e.g. an MDN doc), open the popup → **Save** tab → *Add this page to my corpus*.
5. Wait for "Saved N chunks".
6. Go to the **Search** tab, type something from the article, hit search.
7. Click a result row to expand the snippet, then **Go to this section** — Chrome opens the page and scrolls to the matched text.

## Project layout

```
backend/   FastAPI + Qdrant client + Google embeddings + SQLite users
extension/ React + Vite + Tailwind + shadcn primitives, MV3
```

See `backend/README.md` and `extension/CHANGES.md` for details.

## Swapping embeddings

`backend/app/embeddings.py` is the only Google touchpoint. Reimplement `embed_documents` and `embed_query` against any other backend (TEI, OpenAI, local) without touching the rest. If you change vector dimensionality, update `EMBEDDING_DIM` in `.env` and recreate the Qdrant collection.
