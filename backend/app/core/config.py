from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """アプリケーション全体の設定。
    環境変数 or .env から読み込む（pydantic-settings）。
    """

    # --- App ---
    app_name: str = Field(default="NameCard Manager", description="アプリケーション名")
    debug: bool = Field(default=False, description="デバッグモード")

    # --- Database ---
    database_url: str = Field(
        default="postgresql+psycopg://user:password@db:5432/myapp",
        description="PostgreSQL 接続 URL",
    )

    # --- Logging ---
    log_level: str = Field(default="INFO", description="ログレベル")
    log_format: str = Field(
        default="text",
        description="ログ形式 ('text' or 'json')",
    )

    # --- JWT ---
    secret_key: str = Field(
        default="change-me-in-production",
        description="JWT 署名用シークレットキー",
    )
    jwt_algorithm: str = Field(default="HS256", description="JWT アルゴリズム")
    jwt_expire_minutes: int = Field(default=60, description="JWT 有効期限（分）")

    # --- Image ---
    image_dir: str = Field(
        default="./uploads/images",
        description="画像保存ディレクトリ",
    )
    gemini_api_key: str = Field(
        default="",
        description="Gemini API キー",
    )

    # --- CORS ---
    allowed_origins: list[str] = Field(
        default=["http://localhost:3000"],
        description="CORS 許可オリジン",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Settings シングルトンを返す（LRU cache で 1 回だけ生成）。"""
    return Settings()
