# RAG Extension Backend

FastAPI service for the personal-corpus Chrome extension. Stores per-user web-page chunks in Qdrant, embeds with Google `gemini-embedding-001`, and authenticates each request via a per-user UUID issued at registration.

## Endpoints

| Method | Path              | Auth   | Purpose                                         |
|--------|-------------------|--------|-------------------------------------------------|
| POST   | `/users/register` | none   | `{username}` → `{username, uuid}`. UUID = key.  |
| POST   | `/ingest`         | Bearer | Upsert a page's chunks (replaces previous).     |
| POST   | `/search`         | Bearer | Vector search filtered by `user_uuid`.          |
| GET    | `/health`         | none   | Liveness probe.                                 |

Auth header: `Authorization: Bearer <uuid>`.

## Run locally

```bash
cd backend
cp .env.example .env       # then edit GOOGLE_API_KEY
docker compose up -d       # starts Qdrant on :6333
uv sync                    # or: pip install -e .
uv run uvicorn app.main:app --reload --port 8000
```

## Data shapes

**Ingest** (`POST /ingest`):
```json
{
  "url": "https://example.com/page",
  "page_title": "Example",
  "chunks": [
    {
      "text": "full chunk text...",
      "position": 0,
      "anchor": {
        "text_prefix": "first ~80 chars of chunk used for STTF deep-link",
        "text_suffix": null,
        "heading_path": ["Intro", "Background"]
      }
    }
  ]
}
```

**Search** (`POST /search`):
```json
{"query": "what is X", "top_k": 10}
```

Each hit includes a `goto_url` of the form `pageUrl#:~:text=<prefix>[,<suffix>]` (Chrome Scroll-to-Text-Fragment) so the "Go to" button can scroll directly to the matching span without storing pixel offsets.

## Swapping embeddings

`embeddings.py` is the only Google touchpoint. Swap to TEI (Bitakora-style) by reimplementing `embed_documents` / `embed_query` against `http://tei:80/embed`.
