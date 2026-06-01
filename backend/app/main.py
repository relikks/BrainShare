import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db, vector_store
from .config import settings
from .routers import branding, ingest, search, users

logger = logging.getLogger("sigshare")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.init_db()
    await vector_store.ensure_collection()
    yield


app = FastAPI(title="RAG Extension Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR = Path(__file__).parent / "static"
_STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

app.include_router(users.router)
app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(branding.router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    logger.warning(
        "Validation error on %s %s: %s", request.method, request.url.path, errors
    )
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
