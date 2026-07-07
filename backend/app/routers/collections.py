from fastapi import APIRouter, Query

from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import (
    BrowseOut,
    CollectionCreate,
    CollectionOut,
    Crumb,
    DirectoryOut,
    FileOut,
    MemberAdd,
    MemberOut,
    ModuleInfo,
    ModulesOut,
    ModulesUpdate,
    TagCount,
)
from ..models import Role
from ..modules import MODULES, effective_modules
from ..services import collections as svc
from ..services import directories as dir_svc
from ..services import files as file_svc
from ..services.permissions import require_member


def _modules_out(coll) -> ModulesOut:
    eff = effective_modules(coll)
    return ModulesOut(
        modules=[
            ModuleInfo(
                name=name,
                label=meta["label"],
                desc=meta["desc"],
                modalities=meta["modalities"],
                enabled=eff[name],
            )
            for name, meta in MODULES.items()
        ]
    )

router = APIRouter(prefix="/collections", tags=["collections"])


@router.post("", response_model=CollectionOut, status_code=201)
async def create(payload: CollectionCreate, user: CurrentUser, session: SessionDep) -> CollectionOut:
    c = await svc.create_collection(session, user, payload.name)
    return CollectionOut(id=c.id, name=c.name, slug=c.slug, role=Role.owner, created_at=c.created_at)


@router.get("", response_model=list[CollectionOut])
async def list_mine(user: CurrentUser, session: SessionDep) -> list[CollectionOut]:
    return [
        CollectionOut(id=c.id, name=c.name, slug=c.slug, role=role, created_at=c.created_at)
        for c, role in await svc.list_for_user(session, user)
    ]


@router.get("/{collection_id}", response_model=CollectionOut)
async def get_one(collection_id: str, user: CurrentUser, session: SessionDep) -> CollectionOut:
    c, role = await require_member(session, user, collection_id)
    return CollectionOut(id=c.id, name=c.name, slug=c.slug, role=role, created_at=c.created_at)


@router.get("/{collection_id}/browse", response_model=BrowseOut)
async def browse(
    collection_id: str,
    user: CurrentUser,
    session: SessionDep,
    directory_id: str | None = Query(default=None),
) -> BrowseOut:
    c, role = await require_member(session, user, collection_id)
    directory = (
        await dir_svc.get(session, collection_id, directory_id) if directory_id else None
    )
    crumbs = await dir_svc.breadcrumb(session, c.name, directory)
    dirs = await dir_svc.list_children(session, collection_id, directory_id)
    files = await file_svc.list_in_dir(session, collection_id, directory_id)
    return BrowseOut(
        collection=CollectionOut(
            id=c.id, name=c.name, slug=c.slug, role=role, created_at=c.created_at
        ),
        directory_id=directory_id,
        breadcrumb=[Crumb(**c_) for c_ in crumbs],
        directories=[DirectoryOut.model_validate(d) for d in dirs],
        files=[FileOut.model_validate(f) for f in files],
    )


@router.get("/{collection_id}/tags", response_model=list[TagCount])
async def collection_tags(
    collection_id: str,
    user: CurrentUser,
    session: SessionDep,
    directory_id: str | None = Query(default=None),
) -> list[TagCount]:
    """Distinct object tags (Florence, stored in file.meta.tags) across the collection —
    or, when directory_id is given, that folder and its subtree. Feeds the tag-filter
    modal so the user picks from tags that actually exist in scope."""
    await require_member(session, user, collection_id)
    files = await file_svc.list_for_tags(session, collection_id, directory_id)
    counts: dict[str, int] = {}
    for f in files:
        for tag in (f.meta or {}).get("tags", []) or []:
            counts[tag] = counts.get(tag, 0) + 1
    return [
        TagCount(tag=t, count=n)
        for t, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


@router.delete("/{collection_id}", status_code=204)
async def delete(collection_id: str, user: CurrentUser, session: SessionDep) -> None:
    await require_member(session, user, collection_id, min_role=Role.owner)
    await svc.delete_collection(session, collection_id)


@router.get("/{collection_id}/members", response_model=list[MemberOut])
async def members(collection_id: str, user: CurrentUser, session: SessionDep) -> list[MemberOut]:
    await require_member(session, user, collection_id)
    return [
        MemberOut(username=u.username, role=role)
        for u, role in await svc.list_members(session, collection_id)
    ]


@router.post("/{collection_id}/members", response_model=MemberOut, status_code=201)
async def add_member(
    collection_id: str, payload: MemberAdd, user: CurrentUser, session: SessionDep
) -> MemberOut:
    await require_member(session, user, collection_id, min_role=Role.owner)
    target, role = await svc.add_member(session, collection_id, payload.username, payload.role)
    return MemberOut(username=target.username, role=role)


# ── AI modules (per-collection) ──
@router.get("/{collection_id}/modules", response_model=ModulesOut)
async def get_modules(collection_id: str, user: CurrentUser, session: SessionDep) -> ModulesOut:
    c, _ = await require_member(session, user, collection_id)
    return _modules_out(c)


@router.put("/{collection_id}/modules", response_model=ModulesOut)
async def set_modules(
    collection_id: str, payload: ModulesUpdate, user: CurrentUser, session: SessionDep
) -> ModulesOut:
    c, _ = await require_member(session, user, collection_id, min_role=Role.editor)
    overrides = dict(c.modules or {})
    for name, val in payload.modules.items():
        if name in MODULES and isinstance(val, bool):
            overrides[name] = val
    c.modules = overrides
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return _modules_out(c)
