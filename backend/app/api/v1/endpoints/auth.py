"""Auth endpoints – ユーザー登録・ログイン・プロフィール取得。

エンドポイント:
- POST /auth/register: ユーザー登録
- POST /auth/login: ログイン（JWT 発行）
- GET /auth/me: 現在のユーザー情報取得（要認証）
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import AuthUser, DbSession
from app.core.auth import create_access_token, get_password_hash, verify_password
from app.models import User
from app.schemas import Token, UserCreate, UserLogin, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── POST /auth/register ─────────────────────────
@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(
    body: UserCreate,
    db: DbSession,
) -> UserResponse:
    """ユーザーを新規登録する。"""
    # email 重複チェック
    existing = db.execute(
        select(User).where(User.email == body.email)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        password_hash=get_password_hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
    )


# ─── POST /auth/login ────────────────────────────
@router.post("/login", response_model=Token)
def login(
    body: UserLogin,
    db: DbSession,
) -> Token:
    """メールアドレスとパスワードで認証し、JWT を発行する。"""
    user = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
    )
    return Token(access_token=access_token)


# ─── GET /auth/me ─────────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: AuthUser,
    db: DbSession,
) -> UserResponse:
    """現在のユーザー情報を取得する（要認証）。"""
    user = db.execute(
        select(User).where(User.id == current_user.id)
    ).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
    )
