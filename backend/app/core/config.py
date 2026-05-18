from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    anthropic_api_key: str
    jwt_secret: str
    jwt_expire_hours: int = 8
    database_url: str = "sqlite:///./data/amazon_assistant.db"
    sorftime_mcp_url: str = ""
    sorftime_mcp_api_key: str = ""
    maijia_mcp_url: str = ""
    maijia_mcp_api_key: str = ""


settings = Settings()
