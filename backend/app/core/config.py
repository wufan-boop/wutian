from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    jwt_secret: str
    jwt_expire_hours: int = 8
    database_url: str = "sqlite:///./data/amazon_assistant.db"
    sorftime_mcp_url: str = ""
    sorftime_mcp_api_key: str = ""
    maijia_mcp_url: str = ""
    maijia_mcp_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
