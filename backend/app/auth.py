from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .auth_supabase import InvalidToken, looks_like_jwt, verify_supabase_jwt
from .db import SessionDep
from .models import User
from .services import apikeys as apikey_service
from .services import users as user_service


async def current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the caller from a Bearer token, accepting three credential kinds:

    1. **API key** (`bsk_…`) — a programmatic credential that acts AS its user
       (the secretary uploading/searching from the Apple Watch).
    2. **Supabase-Auth JWT** — the web login; validated and mapped to a user
       (created on first sight).
    3. **Legacy raw UUID** — the pre-OAuth bearer, kept for the transition.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()

    # 1) API key — acts as its owner.
    if token.startswith(apikey_service.KEY_PREFIX):
        user = await apikey_service.verify(session, token)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked API key")
        return user

    # 2) Supabase-Auth JWT (web login).
    if looks_like_jwt(token):
        try:
            claims = await verify_supabase_jwt(token)
        except InvalidToken as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
        sub = claims.get("sub")
        if not sub:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")
        return await user_service.upsert_from_oauth(session, sub, claims.get("email"))

    # 3) Legacy raw-UUID bearer (transition).
    user = await user_service.get_user_by_uuid(session, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credential")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
