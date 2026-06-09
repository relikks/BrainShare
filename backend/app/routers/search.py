"""Multi-modal semantic search.

A query is embedded into each space implied by the selected modalities, every
space is searched (scoped to accessible collections and, optionally, a directory
subtree), and hits are merged by file (max score across the file's vectors).
"""

from fastapi import APIRouter, HTTPException

from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import Crumb, SearchHit, SearchQuery, SearchResults, Segment
from ..embedding import get_embedder, spaces_for_modalities
from ..models import Modality
from ..services import directories as dir_svc
from ..services.permissions import accessible_collection_ids, require_member
from .. import vector_store

router = APIRouter(tags=["search"])

OVERSAMPLE = 4  # pull extra per space so merge-by-file has material


def _crumbs(collection_name: str, dir_path: str) -> list[Crumb]:
    crumbs = [Crumb(id=None, name=collection_name)]
    for name in dir_path.strip("/").split("/"):
        if name:
            crumbs.append(Crumb(id=None, name=name))
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

    embedder = get_embedder()
    spaces = spaces_for_modalities(payload.modalities)
    raw_limit = payload.top_k * OVERSAMPLE

    # file_id -> aggregate
    best: dict[str, dict] = {}
    for space in spaces:
        qvec = await embedder.query_vector(space, payload.query)
        points = await vector_store.search(
            space,
            qvec,
            top_k=raw_limit,
            collection_ids=cids,
            modalities=payload.modalities,
            ancestor_dir_id=ancestor_dir_id,
            directory_id=directory_id,
        )
        for p in points:
            pl = p.payload or {}
            fid = pl.get("file_id")
            if not fid:
                continue
            score = float(p.score)
            entry = best.get(fid)
            if entry is None:
                entry = {"score": -1.0, "spaces": set(), "best": None, "payload": pl}
                best[fid] = entry
            entry["spaces"].add(space)
            if score > entry["score"]:
                entry["score"] = score
                entry["payload"] = pl
                entry["best"] = Segment(
                    space=space,
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
                breadcrumb=_crumbs(pl.get("collection_name", ""), pl.get("dir_path", "/")),
                score=e["score"],
                best=e["best"],
                matched_spaces=sorted(e["spaces"]),
            )
        )
    if payload.min_score > 0:
        hits = [h for h in hits if h.score >= payload.min_score]
    hits.sort(key=lambda h: h.score, reverse=True)
    return SearchResults(hits=hits[: payload.top_k])
