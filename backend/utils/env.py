from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    GOOGLE_CLOUD_PROJECT: str
    GOOGLE_CLOUD_LOCATION: str
    GOOGLE_GENAI_USE_VERTEXAI: bool
    GOOGLE_CLOUD_BUCKET_NAME: Optional[str] = None  # Optional - not needed if using local storage
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None  # Optional - path to service account JSON
    REDIS_URL: Optional[str] = None  # Optional - not needed for basic MVP
    FRONTEND_URL: str = "http://localhost:5173"  # Default for local dev
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"  # Ignore any extra env vars not defined in the model
    )
settings = Settings()
