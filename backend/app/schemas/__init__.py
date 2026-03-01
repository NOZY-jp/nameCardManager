"""Pydantic schemas – API リクエスト / レスポンス定義。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr


# ─── Auth / Internal ─────────────────────────────────────────
class CurrentUser(BaseModel):
    """認証依存性から返されるユーザー情報。"""

    id: int
    email: str


# ─── Auth Request ────────────────────────────────────────────
class UserCreate(BaseModel):
    """ユーザー登録リクエスト。"""

    email: EmailStr
    password: str


class UserLogin(BaseModel):
    """ログインリクエスト。"""

    email: EmailStr
    password: str


# ─── Auth Response ───────────────────────────────────────────
class Token(BaseModel):
    """JWT トークンレスポンス。"""

    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """ユーザー情報レスポンス。"""

    id: int
    email: str
    created_at: datetime
