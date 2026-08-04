from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    frontend_dist: Path = Field(
        default=Path("/app/frontend/dist"), alias="FRONTEND_DIST"
    )
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://localhost:8000",
        alias="CORS_ORIGINS",
    )
    upload_dir: Path = Field(default=Path("./data/uploads"), alias="UPLOAD_DIR")
    settings_api_timeout_seconds: int = Field(
        default=10, alias="SETTINGS_API_TIMEOUT_SECONDS"
    )
    audit_log_dir: Path = Field(default=Path("./data/logs"), alias="AUDIT_LOG_DIR")
    db_vacuum_threshold: int = Field(default=500, alias="DB_VACUUM_THRESHOLD")
    db_path: Path = Field(default=Path("./data/localmind.db"), alias="DB_PATH")
    ollama_host: str = Field(default="http://localhost:11434", alias="OLLAMA_HOST")
    chromadb_dir: Path = Field(default=Path("./data/chromadb"), alias="CHROMADB_DIR")

    # Values from .env.example
    default_model: str = Field(default="llama3", alias="DEFAULT_MODEL")
    exports_dir: Path = Field(default=Path("./data/exports"), alias="EXPORTS_DIR")
    max_file_size: int = Field(default=52428800, alias="MAX_FILE_SIZE")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    frontend_port: int = Field(default=3000, alias="FRONTEND_PORT")

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
