from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./namecards.db"
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "https://namecard.com",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
