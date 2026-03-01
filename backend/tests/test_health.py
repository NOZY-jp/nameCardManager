"""ヘルスチェックエンドポイントのテスト。"""

from __future__ import annotations

from fastapi.testclient import TestClient


class TestHealthOk:
    """正常系: DB 正常時に ok を返す。"""

    def test_health_ok(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data == {"status": "ok", "database": "ok"}


class TestHealthNoAuthRequired:
    """エッジケース: 認証なしでアクセスできる。"""

    def test_health_no_auth_required(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
