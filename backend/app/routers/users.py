from fastapi import APIRouter, HTTPException, status

from .. import db
from ..schemas import UserOut, UserRegister

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister) -> UserOut:
    username = payload.username.strip()
    result = await db.create_user(username)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{username}' already exists",
        )
    name, user_uuid = result
    return UserOut(username=name, uuid=user_uuid)
