from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All config is env-overridable; no secrets are baked in. See backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Relational store ── SQLite for dev, Postgres in prod (same SQLModel code).
    database_url: str = "sqlite+aiosqlite:///./data/brainshare.db"

    # ── Vector store (Qdrant) ── embedded local path for dev; URL for served mode.
    qdrant_path: str | None = "./data/qdrant"
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None

    # ── Blob storage ──
    blob_dir: str = "./data/blobs"

    # ── Modal (GPU inference) ── token also lives in ~/.modal.toml (profile relikks).
    modal_app_name: str = "brainshare-embed"
    modal_profile: str | None = None
    modal_token_id: str | None = None
    modal_token_secret: str | None = None
    # When true, skip Modal and use deterministic local stub vectors (offline dev/tests).
    embed_stub: bool = False

    # ── App ──
    cors_origins: str = "chrome-extension://*,http://localhost:5173,http://localhost:4700"
    brand_name: str = "BrainShare"
    brand_logo_path: str = "logo.svg"  # relative to app/static/

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
