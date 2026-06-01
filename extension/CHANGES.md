# Fork plan: Site RAG → personal-corpus extension

Goal: turn Site RAG into a thin client of our FastAPI backend. Strip every cloud/LLM concern; keep the React + Tailwind shell and the HTML extraction.

## What to rip out

- `src/lib/supabase.ts` — delete.
- `src/lib/index-db.ts` — delete (LangChain vector store + embeddings live here).
- `src/lib/clear-docs.ts` — delete.
- `src/graphs/` — delete the whole query graph (no LLM in our flow).
- `src/components/model-selector/` — delete.
- `src/components/assistant-ui/`, `src/runtimes/assistant-ui.tsx` — delete (chat UI not needed).
- Dependencies to drop from `package.json`: `@langchain/*`, `@supabase/*`, `firecrawl`, `@assistant-ui/*`, all model SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `together-ai`, `ollama`).

## What to add

### 1. `src/lib/api.ts` — backend client
Thin wrapper around `fetch` with the configured `endpoint` + Bearer UUID:
- `registerUser(endpoint, username) → {username, uuid}`
- `ingestPage(endpoint, uuid, PageIngest)`
- `searchCorpus(endpoint, uuid, query, topK) → SearchHit[]`

### 2. `src/lib/settings-store.ts`
Persist in `chrome.storage.local`:
- `endpoint` (default `http://localhost:8000`)
- `username`
- `uuid`
- `topK` (default 10)

### 3. `src/lib/extract.ts` — anchor-aware chunker
Runs in a content script. For the current tab:
1. Use Readability.js (already a Site-RAG dep candidate, or add `@mozilla/readability`) to get the article DOM.
2. Walk the DOM in order. Maintain a `headingPath` stack as `<h1>..<h6>` are encountered.
3. Accumulate text into chunks of ~800–1200 chars, breaking on heading boundaries.
4. For each chunk emit:
   ```ts
   {
     text,
     position,
     anchor: {
       text_prefix: text.slice(0, 80).trim(),
       text_suffix: null,            // optional: last 40 chars for disambiguation
       heading_path: [...]
     }
   }
   ```

### 4. `src/components/Setup.tsx` — first-run / settings screen
- Endpoint URL input.
- "Generate user" panel: username → POST `/users/register` → save `{username, uuid}` to settings. Show the UUID once with a copy button (it's effectively the password).
- "Import existing UUID" path for re-installs / second device.
- Validation: 409 → show "username taken".

### 5. `src/components/SaveButton.tsx`
Big primary button in popup: "Add this page". Runs the chunker on the active tab, POSTs `/ingest`, toasts `ingested: N (replaced: M)`.

### 6. `src/components/SearchView.tsx`
- Search box at top.
- Hit list: each card shows `page_title` (link), `section_title` (smaller, breadcrumb of `heading_path`), an expandable snippet with the chunk text and the matched span highlighted, and a "Go to" button that opens `hit.goto_url` (a `#:~:text=` URL — Chrome handles the scroll + highlight natively).

## Files to keep / adapt

- `src/components/ui/*` — shadcn primitives, keep.
- `tailwind.config.js`, `vite.config.ts`, `index.html`, manifest — keep, adjust manifest permissions to `activeTab`, `scripting`, `storage`; remove host permissions for OpenAI/Anthropic/etc.
- `src/App.tsx` — replace router: if no UUID → `<Setup/>`, else tabs `[Search | Save | Settings]`.

## Manifest

`public/manifest.json` should end up roughly:
```json
{
  "manifest_version": 3,
  "name": "Personal Corpus",
  "version": "0.1.0",
  "action": { "default_popup": "index.html" },
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["<all_urls>"]
}
```

## "Go to" deep-link

We use [Scroll-to-Text-Fragment](https://wicg.github.io/scroll-to-text-fragment/) — supported natively in Chrome since v80. Format:
`<page-url>#:~:text=<url-encoded-prefix>[,<url-encoded-suffix>]`
Robust to reflows: the browser finds the text rather than relying on a pixel offset.
