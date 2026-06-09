from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .db import SessionDep
from .models import User
from .services import users as user_service


async def current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token"
        )
    token = authorization.split(" ", 1)[1].strip()
    user = await user_service.get_user_by_uuid(session, token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user UUID"
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]
