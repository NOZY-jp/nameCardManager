"""JWT 発行・検証、パスワードハッシュ化を行う認証モジュール。"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import DecodeError, ExpiredSignatureError, decode, encode
from passlib.context import CryptContext

from app.core.config import get_settings
from app.schemas import CurrentUser

logger = logging.getLogger(__name__)
settings = get_settings()

# auto_error=False にして、未認証時は 401 を返すように手動制御する。
# FastAPI の HTTPBearer デフォルト (auto_error=True) は 403 を返すが、
# HTTP 仕様上、認証が必要なリソースへの未認証リクエストは 401 が正しい。
security = HTTPBearer(auto_error=False)

# bcrypt コンテキスト
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── パスワード ──────────────────────────────────────────────
def get_password_hash(password: str) -> str:
    """パスワードを bcrypt でハッシュ化する。"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """平文パスワードとハッシュを比較検証する。"""
    return pwd_context.verify(plain_password, hashed_password)


# ─── JWT ─────────────────────────────────────────────────────
def create_access_token(data: dict[str, object]) -> str:
    """JWT アクセストークンを発行する（HS256）。"""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    return encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> dict[str, object]:
    """JWT トークンを検証してペイロードを返す。"""
    return decode(
        token,
        settings.secret_key,
        algorithms=[settings.jwt_algorithm],
    )


# ─── FastAPI Dependencies ────────────────────────────────────
def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> CurrentUser:
    """JWT を検証して CurrentUser を返す。"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    token = credentials.credentials
    try:
        payload = verify_token(token)
        user_id = payload.get("sub")
        email = payload.get("email")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing user id in token",
            )
        return CurrentUser(id=int(str(user_id)), email=str(email))
    except ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        ) from e
    except DecodeError as e:
        logger.warning("Invalid token: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from e
