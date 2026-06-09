# BrainShare — Roadmap

The MVP proves the core: multi-modal files → per-modality embeddings → NL search
across any combination, scoped to collections/directories. These are the next
layers. They're captured here because each one *extends the existing seams*
rather than redesigning anything.

## 1. Dynamic, type-aware metadata filters (combined with vector search)

**Goal:** filter the corpus by structured per-type attributes *and* semantic
similarity at once — "videos **under 2 min** about rockets", "audio **> 48kHz**
of a violin", "**portrait** images of a coastline".

**How it fits what exists:**
- The pipeline already runs per modality; extend each extractor to emit metadata
  (video: `duration_s`, `width`, `height`, `fps`, `has_audio`; audio:
  `duration_s`, `sample_rate`, `channels`; image: `width`, `height`, `aspect`;
  text: `word_count`, `lang`). Store on a new `files.meta JSON` column **and** in
  the Qdrant payload (the filterable subset).
- Search already builds Qdrant filters in `vector_store._build_filter`. Add a
  generic `filters: [{field, op, value}]` to `SearchQuery` → Qdrant `Range`/`Match`
  conditions. Vector ranking is unchanged; the filter just narrows the candidate set.
- **UI:** the layer-dependent **filter bar** (already built) becomes *dynamic* —
  it renders controls based on the selected modality (video → duration slider,
  image → dimensions, etc.). This is the "filters dependent on file type" idea,
  dropped straight into the panel we already have.

**Lift:** moderate. No new models. Metadata from `ffprobe`/PIL (or returned by the
Modal embedders alongside the vector).

## 2. Entities — people (and contributors) across the corpus

**Goal:** detect faces in images and voices in audio/video, let users name them as
**entities** per collection, then **search/filter by entity or groups of entities**
— "pictures with Maria **and** Jorge from summer", "every clip where Martin's voice
appears". For shared corpora, tag documents to the **people responsible** so any
reader can trace who to ask.

**The key realization (yours):** this works *without* a shared text↔face/voice
space. Detection + naming turns biometric similarity into **named tags**; search
then becomes **array-membership filtering** — which is *exactly* the pattern that
already powers directory-subtree scoping (`ancestor_dir_ids CONTAINS <dir>`). Here
it's `entity_ids CONTAINS <person>` (AND across people for groups).

**How it fits / what's new:**
- **Relational:** `entities(id, collection_id, name, created_by)` and
  `file_entities(file_id, entity_id, source: detected|tagged, modality, locator,
  confidence)` where `locator` is a face bbox or an audio time-range.
- **Detection models on Modal** (same scale-to-zero `@app.cls` pattern):
  - faces → detector + ArcFace/InsightFace embeddings (per image);
  - voices → diarization + speaker embeddings (pyannote / ECAPA) on audio & video tracks.
- **Entity resolution reuses the vector store:** add `space_face` and `space_voice`
  Qdrant collections of biometric embeddings. A named entity is a labelled cluster;
  new detections are matched by cosine to suggest a tag (user confirms/corrects).
- **Search:** stamp confirmed `entity_ids` into each file's payload → filter by
  `entity_ids CONTAINS x` (AND for groups), optionally combined with a semantic
  query and the metadata filters from §1. Cross-modal by construction: "where has
  Martin appeared" unions his face hits (images/video) and voice hits (audio/video).
- **Provenance:** `file_entities.source = 'tagged'` with a role (author/owner/
  responsible) gives shared docs a "who to ask" trail.

**Lift:** larger — two new model families + a tagging/resolution UI — but the
search engine itself is unchanged; it gains another payload filter.

## Sequencing

1. Finish MVP hardening + the test corpus (current).
2. §1 metadata filters + dynamic filter bar (small, high-value, no new models).
3. §2 entities — faces first (images are the densest signal), then voices, then
   the group-tagging and provenance UX.

Guiding invariant: **new capabilities are payload filters + optional new vector
spaces, never a rewrite of the core search.**
