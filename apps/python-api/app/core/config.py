from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database (Neon PostgreSQL)
    database_url: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # App URLs
    app_url: str = "http://localhost:3002"
    api_url: str = "http://localhost:8000"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3002"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
