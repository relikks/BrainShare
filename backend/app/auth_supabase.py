"""Validate Supabase-Auth access tokens.

We support three verification paths, in order of what's configured:

1. **Local HS256** — if the project's JWT secret is set (legacy symmetric projects).
2. **Local asymmetric (ES256/RS256)** via the project JWKS (modern projects).
3. **Remote** — ask Supabase itself (`GET /auth/v1/user` with the anon key). Works
   for *any* signing without holding a secret; results are cached briefly so it's
   one round-trip per token per few minutes, not per request.

The token's `alg` header routes 1↔2; when neither key is configured we fall back
to (3), which is the default for a legacy project where we only hold the anon key.
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache

import httpx
import jwt
from jwt import PyJWKClient

from .config import settings

log = logging.getLogger("brainshare.auth")


class InvalidToken(Exception):
    pass


def looks_like_jwt(token: str) -> bool:
    return token.count(".") == 2 and token.startswith("ey")


@lru_cache(maxsize=1)
def _jwk_client() -> PyJWKClient | None:
    url = settings.supabase_jwks_url
    return PyJWKClient(url, cache_keys=True) if url else None


def _alg(token: str) -> str | None:
    try:
        return jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        return None


def _verify_local(token: str) -> dict | None:
    """Local signature check when a key/secret is configured for the token's alg.
    Returns claims, None if no local method applies, or raises on a bad signature."""
    aud = settings.supabase_jwt_aud
    alg = _alg(token)
    if settings.supabase_jwt_secret and alg == "HS256":
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience=aud)
    client = _jwk_client()
    if client is not None and alg in ("ES256", "RS256"):
        key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["ES256", "RS256"], audience=aud)
    return None


# token -> (claims, monotonic-expiry). Cheap defence against per-request round-trips.
_remote_cache: dict[str, tuple[dict, float]] = {}
_REMOTE_TTL = 300.0


async def _verify_remote(token: str) -> dict:
    now = time.monotonic()
    hit = _remote_cache.get(token)
    if hit and hit[1] > now:
        return hit[0]
    if not (settings.supabase_url and settings.supabase_anon_key):
        raise InvalidToken("no Supabase auth configured")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_anon_key},
            )
    except httpx.HTTPError as exc:
        raise InvalidToken(f"auth check failed: {exc}") from exc
    if r.status_code != 200:
        raise InvalidToken(f"Supabase rejected token ({r.status_code})")
    data = r.json()
    claims = {"sub": data.get("id"), "email": data.get("email")}
    if not claims["sub"]:
        raise InvalidToken("token has no user id")
    _remote_cache[token] = (claims, now + _REMOTE_TTL)
    if len(_remote_cache) > 2000:  # keep the cache from growing unbounded
        for k in [k for k, (_, exp) in _remote_cache.items() if exp <= now]:
            _remote_cache.pop(k, None)
    return claims


async def verify_supabase_jwt(token: str) -> dict:
    """Return validated claims ({sub, email, …}) or raise InvalidToken."""
    try:
        local = _verify_local(token)
    except jwt.PyJWTError as exc:
        raise InvalidToken(str(exc)) from exc
    if local is not None:
        return local
    return await _verify_remote(token)
