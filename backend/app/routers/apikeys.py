from fastapi import APIRouter, HTTPException, status

from ..auth import CurrentUser
from ..db import SessionDep
from ..dto import ApiKeyCreate, ApiKeyCreated, ApiKeyOut
from ..services import apikeys as svc

router = APIRouter(prefix="/apikeys", tags=["apikeys"])


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(payload: ApiKeyCreate, user: CurrentUser, session: SessionDep) -> ApiKeyCreated:
    """Mint a key that acts AS the caller. The raw key is returned ONCE here."""
    key, raw = await svc.mint(session, user.id, payload.name)
    return ApiKeyCreated(**ApiKeyOut.model_validate(key).model_dump(), key=raw)


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(user: CurrentUser, session: SessionDep) -> list[ApiKeyOut]:
    return [ApiKeyOut.model_validate(k) for k in await svc.list_for(session, user.id)]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(key_id: str, user: CurrentUser, session: SessionDep) -> None:
    if not await svc.revoke(session, user.id, key_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
