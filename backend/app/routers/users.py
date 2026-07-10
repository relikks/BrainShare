from fastapi import APIRouter, HTTPException, status

from ..auth import CurrentUser
from ..db import SessionDep
from ..schemas import UserOut, UserRegister
from ..services import users as user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, session: SessionDep) -> UserOut:
    username = payload.username.strip()
    user = await user_service.create_user(session, username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{username}' already exists",
        )
    return UserOut(id=user.id, username=user.username, email=user.email, uuid=user.uuid)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut(id=user.id, username=user.username, email=user.email, uuid=user.uuid)
