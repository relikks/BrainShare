from fastapi import Depends, Header, HTTPException, status

from . import db


async def current_user_uuid(
    authorization: str | None = Header(default=None),
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()
    username = await db.get_user_by_uuid(token)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user UUID",
        )
    return token


UserDep = Depends(current_user_uuid)
