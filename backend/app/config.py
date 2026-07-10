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

    # ── Auth (Supabase Auth as IdP) ──
    # The app validates Supabase-issued JWTs. Asymmetric keys (ES256) are verified via
    # the project JWKS; if the project still signs legacy HS256, set supabase_jwt_secret.
    supabase_url: str | None = None  # e.g. https://rpolphgnfajyxdfnaszp.supabase.co
    supabase_anon_key: str | None = None  # public; used to ask Supabase to validate a token
    supabase_jwt_aud: str = "authenticated"
    supabase_jwt_secret: str | None = None  # optional: local HS256 validation (legacy projects)
    # Comma-separated emails granted admin (e.g. run data migration / see everyone).
    admin_emails: str = ""

    @property
    def supabase_jwks_url(self) -> str | None:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json" if self.supabase_url else None

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    # ── App ──
    cors_origins: str = "chrome-extension://*,http://localhost:5173,http://localhost:4700"
    brand_name: str = "BrainShare"
    brand_logo_path: str = "logo.svg"  # relative to app/static/

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
