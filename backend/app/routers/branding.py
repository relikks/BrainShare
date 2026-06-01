from fastapi import APIRouter, Request

from ..config import settings

router = APIRouter(tags=["branding"])


@router.get("/branding")
async def branding(request: Request) -> dict:
    base = str(request.base_url).rstrip("/")
    return {
        "name": settings.brand_name,
        "logo_url": f"{base}/static/{settings.brand_logo_path}",
    }
