"""認証エンドポイントのテスト。

POST /api/v1/auth/register  – ユーザー登録
POST /api/v1/auth/login     – ログイン（JWT 発行）
GET  /api/v1/auth/me        – 現在のユーザー情報取得（要認証）
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from jwt import encode

from app.core.config import get_settings


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_register_success(client: TestClient) -> None:
    """新規ユーザーを登録できる。"""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "securepass123"},
    )

    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)
    assert data["email"] == "test@example.com"
    assert isinstance(data["created_at"], str)


def test_login_success(client: TestClient) -> None:
    """登録済みユーザーでログインし JWT を取得できる。"""
    # Setup: ユーザー登録
    client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "securepass123"},
    )

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "securepass123"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["access_token"], str)
    assert data["token_type"] == "bearer"


def test_get_me_success(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """JWT で認証し自分のプロフィールを取得できる。"""
    resp = client.get("/api/v1/auth/me", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["id"], int)
    assert isinstance(data["email"], str)
    assert isinstance(data["created_at"], str)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  異常系 – register
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_register_duplicate_email(client: TestClient) -> None:
    """既存メールアドレスで登録すると 409。"""
    # Setup: 同一メールで登録済み
    client.post(
        "/api/v1/auth/register",
        json={"email": "existing@example.com", "password": "pass"},
    )

    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "existing@example.com", "password": "pass"},
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Email already registered"


def test_register_invalid_email(client: TestClient) -> None:
    """不正なメールアドレス形式で 422。"""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "pass"},
    )

    assert resp.status_code == 422


def test_register_missing_password(client: TestClient) -> None:
    """パスワード未指定で 422。"""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com"},
    )

    assert resp.status_code == 422


def test_register_missing_email(client: TestClient) -> None:
    """メール未指定で 422。"""
    resp = client.post(
        "/api/v1/auth/register",
        json={"password": "pass"},
    )

    assert resp.status_code == 422


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  異常系 – login
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_login_wrong_password(client: TestClient) -> None:
    """パスワード不一致で 401。"""
    # Setup: ユーザー登録済み
    client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "securepass123"},
    )

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "wrongpass"},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


def test_login_nonexistent_user(client: TestClient) -> None:
    """存在しないユーザーで 401。"""
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "pass"},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  異常系 – me
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_get_me_no_token(client: TestClient) -> None:
    """トークンなしで 401。"""
    resp = client.get("/api/v1/auth/me")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


def test_get_me_invalid_token(client: TestClient) -> None:
    """不正トークンで 401。"""
    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.here"},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid token"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_access_with_expired_token(client: TestClient) -> None:
    """期限切れトークンで保護エンドポイントにアクセスすると 401。"""
    settings = get_settings()
    expired_token = encode(
        {
            "sub": "1",
            "email": "test@example.com",
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )

    resp = client.get(
        "/api/v1/namecards",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Token has expired"
