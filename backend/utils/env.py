from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    GOOGLE_CLOUD_PROJECT: str
    GOOGLE_CLOUD_LOCATION: str
    GOOGLE_GENAI_USE_VERTEXAI: bool
    GOOGLE_CLOUD_BUCKET_NAME: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    REDIS_URL: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:5173"
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

settings = Settings()
