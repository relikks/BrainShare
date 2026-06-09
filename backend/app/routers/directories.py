from fastapi import APIRouter, Query

from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import DirectoryCreate, DirectoryOut
from ..models import Role
from ..services import directories as svc
from ..services.permissions import require_member

router = APIRouter(prefix="/directories", tags=["directories"])


@router.post("", response_model=DirectoryOut, status_code=201)
async def create(payload: DirectoryCreate, user: CurrentUser, session: SessionDep) -> DirectoryOut:
    await require_member(session, user, payload.collection_id, min_role=Role.editor)
    d = await svc.create_directory(
        session, payload.collection_id, payload.parent_id, payload.name.strip()
    )
    return DirectoryOut.model_validate(d)


@router.get("", response_model=list[DirectoryOut])
async def list_children(
    user: CurrentUser,
    session: SessionDep,
    collection_id: str = Query(...),
    parent_id: str | None = Query(default=None),
) -> list[DirectoryOut]:
    await require_member(session, user, collection_id)
    dirs = await svc.list_children(session, collection_id, parent_id)
    return [DirectoryOut.model_validate(d) for d in dirs]
