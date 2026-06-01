import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Fallback: reuse the same .env that the semantic_search scripts already read.
_SHARED_DOTENV = Path("C:/Users/dsan/Documents/scripts/.env")
if not os.environ.get("GOOGLE_API_KEY") and _SHARED_DOTENV.exists():
    for _line in _SHARED_DOTENV.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line.startswith("GOOGLE_API_KEY="):
            os.environ["GOOGLE_API_KEY"] = _line.split("=", 1)[1].strip().strip("'\"")
            break


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    collection_name: str = "web_corpus"
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 768
    users_db_path: str = "./data/users.db"
    cors_origins: str = "chrome-extension://*,http://localhost:5173"
    brand_name: str = "SIGSHARE"
    brand_logo_path: str = "logo.svg"  # relative to app/static/

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
