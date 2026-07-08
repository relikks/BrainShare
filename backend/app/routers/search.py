"""Multi-modal, pipeline-scoped semantic search.

A query runs through *pipelines* (embedding.registry.PIPELINES) — named ways of
searching one file type (image by description, audio by transcript, …). The
caller either names pipelines explicitly or just picks modalities (legacy:
every pipeline of those types). Pipelines sharing a query tower are encoded
once; each pipeline searches its space scoped to accessible collections and,
optionally, a directory subtree. Hits merge by file: the displayed score is the
best cosine, but with several pipelines the *ordering* is RRF-fused — rank-based,
so heterogeneous model score scales can't skew the blend.
"""

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import Crumb, PipelineInfo, PipelinesOut, SearchHit, SearchQuery, SearchResults, Segment
from ..embedding import PIPELINES, Pipeline, get_embedder, pipelines_for_modalities
from ..models import FileEntity, Modality
from ..services import directories as dir_svc
from ..services.permissions import accessible_collection_ids
from .. import vector_store

router = APIRouter(tags=["search"])

OVERSAMPLE = 4  # pull extra per space so merge-by-file has material
RRF_K = 60  # standard reciprocal-rank-fusion damping


@router.get("/pipelines", response_model=PipelinesOut)
async def list_pipelines(user: CurrentUser) -> PipelinesOut:
    """The static search-pipeline catalog (the filter bar builds itself from this)."""
    return PipelinesOut(
        pipelines=[
            PipelineInfo(
                key=p.key, label=p.label, desc=p.desc, modality=str(p.modality), module=p.module
            )
            for p in PIPELINES.values()
        ]
    )


def _resolve_pipelines(payload: SearchQuery) -> list[Pipeline]:
    """Explicit pipeline keys win; otherwise every pipeline of the selected modalities."""
    if payload.pipelines:
        unknown = [k for k in payload.pipelines if k not in PIPELINES]
        if unknown:
            raise HTTPException(422, f"Unknown pipelines: {', '.join(unknown)}")
        return [PIPELINES[k] for k in dict.fromkeys(payload.pipelines)]
    return pipelines_for_modalities(payload.modalities)


def _crumbs(collection_name: str, dir_path: str, ancestor_ids: list | None = None) -> list[Crumb]:
    """Breadcrumb with real directory ids so the UI can link each level — dir_path's
    segments pair 1:1 with the point's ancestor_dir_ids (both root→own-folder)."""
    crumbs = [Crumb(id=None, name=collection_name)]
    ids = list(ancestor_ids or [])
    names = [n for n in dir_path.strip("/").split("/") if n]
    for i, name in enumerate(names):
        crumbs.append(Crumb(id=ids[i] if i < len(ids) else None, name=name))
    return crumbs


@router.post("/search", response_model=SearchResults)
async def search(payload: SearchQuery, user: CurrentUser, session: SessionDep) -> SearchResults:
    # Scope to collections the user can actually see.
    accessible = set(await accessible_collection_ids(session, user))
    if payload.collection_ids:
        cids = [c for c in payload.collection_ids if c in accessible]
    else:
        cids = list(accessible)

    # Directory scope (and, if requested, its whole subtree).
    ancestor_dir_id = directory_id = None
    if payload.directory_id:
        d = None
        for cid in cids:
            try:
                d = await dir_svc.get(session, cid, payload.directory_id)
                cids = [cid]  # a directory pins its collection
                break
            except HTTPException:
                continue
        if d is None:
            raise HTTPException(404, "Directory not found in accessible collections")
        if payload.include_subdirs:
            ancestor_dir_id = payload.directory_id
        else:
            directory_id = payload.directory_id

    if not cids:
        return SearchResults(hits=[])

    # Entity (person/event/category) scope: resolve the linked files up front and pass
    # them as a file_id filter. Empty resolution → no results.
    entity_file_ids: set[str] | None = None
    if payload.entity_ids:
        rows = (
            await session.exec(
                select(FileEntity.file_id).where(FileEntity.entity_id.in_(payload.entity_ids))
            )
        ).all()
        entity_file_ids = set(rows)
        if not entity_file_ids:
            return SearchResults(hits=[])

    pipelines = _resolve_pipelines(payload)
    if not pipelines:
        return SearchResults(hits=[])

    embedder = get_embedder()
    raw_limit = payload.top_k * OVERSAMPLE

    # Encode the query once per tower — transcript/objects/text share Qwen3, so
    # selecting all three still costs a single Modal call.
    qvecs: dict[str, list[float]] = {}
    for qs in dict.fromkeys(p.query_space for p in pipelines):
        qvecs[qs] = await embedder.query_vector(qs, payload.query)

    # file_id -> aggregate. `rrf` accumulates 1/(K+rank) per pipeline; `score`
    # keeps the best raw cosine for display and the min_score floor.
    best: dict[str, dict] = {}
    for pipe in pipelines:
        points = await vector_store.search(
            pipe.space,
            qvecs[pipe.query_space],
            top_k=raw_limit,
            collection_ids=cids,
            modalities=[pipe.modality],
            file_ids=entity_file_ids,
            ancestor_dir_id=ancestor_dir_id,
            directory_id=directory_id,
            meta_filters=payload.filters,
        )
        rank = 0  # per-file rank within this pipeline (points may repeat a file)
        seen_files: set[str] = set()
        for p in points:
            pl = p.payload or {}
            fid = pl.get("file_id")
            if not fid:
                continue
            score = float(p.score)
            entry = best.get(fid)
            if entry is None:
                entry = {
                    "score": -1.0,
                    "rrf": 0.0,
                    "spaces": set(),
                    "pipelines": set(),
                    "best": None,
                    "payload": pl,
                }
                best[fid] = entry
            entry["spaces"].add(pipe.space)
            entry["pipelines"].add(pipe.key)
            if fid not in seen_files:  # RRF counts a file once per pipeline
                seen_files.add(fid)
                entry["rrf"] += 1.0 / (RRF_K + rank)
                rank += 1
            if score > entry["score"]:
                entry["score"] = score
                entry["payload"] = pl
                entry["best"] = Segment(
                    space=pipe.space,
                    pipeline=pipe.key,
                    score=score,
                    text=pl.get("text"),
                    segment=pl.get("segment"),
                    goto_url=pl.get("goto_url"),
                )

    hits: list[SearchHit] = []
    for fid, e in best.items():
        pl = e["payload"]
        hits.append(
            SearchHit(
                file_id=fid,
                file_name=pl.get("file_name", ""),
                modality=Modality(pl.get("file_modality", "text")),
                collection_id=pl.get("collection_id", ""),
                directory_id=pl.get("directory_id"),
                dir_path=pl.get("dir_path", "/"),
                breadcrumb=_crumbs(
                    pl.get("collection_name", ""), pl.get("dir_path", "/"), pl.get("ancestor_dir_ids")
                ),
                score=e["score"],
                best=e["best"],
                matched_spaces=sorted(e["spaces"]),
                matched_pipelines=sorted(e["pipelines"]),
            )
        )
    if payload.min_score > 0:
        hits = [h for h in hits if h.score >= payload.min_score]

    if payload.pipelines and len(pipelines) > 1:
        # Explicit multi-pipeline blend: rank-fused order (score scales aren't
        # comparable across models). Legacy modality queries keep best-cosine order —
        # the corpus battery is tuned to it, and text scores dominating there is the
        # behaviour callers already rely on.
        rrf_of = {fid: e["rrf"] for fid, e in best.items()}
        hits.sort(key=lambda h: (rrf_of.get(h.file_id, 0.0), h.score), reverse=True)
    else:
        hits.sort(key=lambda h: h.score, reverse=True)
    return SearchResults(hits=hits[: payload.top_k])
