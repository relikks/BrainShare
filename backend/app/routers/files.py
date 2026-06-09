from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Query, UploadFile
from fastapi import File as FormFile
from fastapi.responses import Response

from .. import pipeline
from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import FileOut
from ..models import File, Role
from ..services import files as svc
from ..services.permissions import require_member
from ..storage import get_storage

router = APIRouter(prefix="/files", tags=["files"])


async def _file_with_access(session, user, file_id: str, min_role: Role) -> File:
    f = await session.get(File, file_id)
    if f is None:
        raise HTTPException(404, "File not found")
    await require_member(session, user, f.collection_id, min_role=min_role)
    return f


@router.post("", response_model=FileOut, status_code=201)
async def upload(
    user: CurrentUser,
    session: SessionDep,
    background: BackgroundTasks,
    collection_id: str = Form(...),
    directory_id: str | None = Form(default=None),
    file: UploadFile = FormFile(...),
) -> FileOut:
    await require_member(session, user, collection_id, min_role=Role.editor)
    directory_id = directory_id or None  # multipart "" → None
    data = await file.read()
    f = await svc.create_file(
        session, collection_id, user.id, directory_id,
        file.filename or "untitled", file.content_type or "", data,
    )
    background.add_task(pipeline.process_file, f.id)
    return FileOut.model_validate(f)


@router.get("", response_model=list[FileOut])
async def list_files(
    user: CurrentUser,
    session: SessionDep,
    collection_id: str = Query(...),
    directory_id: str | None = Query(default=None),
) -> list[FileOut]:
    await require_member(session, user, collection_id)
    files = await svc.list_in_dir(session, collection_id, directory_id)
    return [FileOut.model_validate(f) for f in files]


@router.get("/{file_id}", response_model=FileOut)
async def get_meta(file_id: str, user: CurrentUser, session: SessionDep) -> FileOut:
    f = await _file_with_access(session, user, file_id, Role.viewer)
    return FileOut.model_validate(f)


@router.get("/{file_id}/content")
async def content(file_id: str, user: CurrentUser, session: SessionDep) -> Response:
    f = await _file_with_access(session, user, file_id, Role.viewer)
    data = await get_storage().get(f.blob_key)
    return Response(
        content=data,
        media_type=f.mime or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{f.name}"'},
    )


@router.delete("/{file_id}", status_code=204)
async def delete(file_id: str, user: CurrentUser, session: SessionDep) -> None:
    f = await _file_with_access(session, user, file_id, Role.editor)
    await svc.delete_file(session, f)
