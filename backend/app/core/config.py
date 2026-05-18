from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    anthropic_api_key: str
    jwt_secret: str
    jwt_expire_hours: int = 8
    database_url: str = "sqlite:///./data/amazon_assistant.db"
    # Comma-separated origins allowed for CORS (dev default allows Vite dev server)
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:80"
    sorftime_mcp_url: str = ""
    sorftime_mcp_api_key: str = ""
    maijia_mcp_url: str = ""
    maijia_mcp_api_key: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
