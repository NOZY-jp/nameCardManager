"""タグ CRUD エンドポイントのテスト。

GET    /api/v1/tags       – タグ一覧（ページネーションなし、配列形式）
POST   /api/v1/tags       – タグ作成
PATCH  /api/v1/tags/{id}  – タグ更新
DELETE /api/v1/tags/{id}  – タグ削除
"""

from __future__ import annotations

from fastapi.testclient import TestClient


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_tag(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """タグを作成できる。"""
    resp = client.post(
        "/api/v1/tags",
        json={"name": "取引先"},
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)
    assert data["name"] == "取引先"


def test_list_tags(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """タグ一覧を取得できる（ページネーションなし・配列形式）。"""
    resp = client.get("/api/v1/tags", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    # 配列形式で返る（ページネーションオブジェクトではない）
    assert isinstance(data, list)
    assert len(data) == 3


def test_list_tags_no_pagination(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """NC-5: タグ一覧はページネーションなしの配列形式で返る。"""
    resp = client.get("/api/v1/tags", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    # NC-5: レスポンスは items/total を持つページネーションオブジェクトではなく素の配列
    assert isinstance(data, list)
    assert "items" not in (data if isinstance(data, dict) else {})
    assert "total" not in (data if isinstance(data, dict) else {})


def test_list_tags_empty(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """タグ 0 件で空配列を返す。"""
    resp = client.get("/api/v1/tags", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_update_tag(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """タグ名を変更できる。"""
    tag_id = sample_tags[0]["id"]
    resp = client.patch(
        f"/api/v1/tags/{tag_id}",
        json={"name": "新しい名前"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == tag_id
    assert data["name"] == "新しい名前"


def test_delete_tag(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """タグを削除できる。"""
    tag_id = sample_tags[0]["id"]
    resp = client.delete(
        f"/api/v1/tags/{tag_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 204


def test_delete_tag_preserves_namecards(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """タグ削除後も紐付いていた名刺は残る。"""
    tag_id = sample_namecard["tag_ids"][0]
    namecard_id = sample_namecard["id"]

    # タグ削除
    resp = client.delete(
        f"/api/v1/tags/{tag_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # 名刺は残存
    resp = client.get(
        f"/api/v1/namecards/{namecard_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # 削除したタグは名刺の tags から除外されている
    tag_ids = [t["id"] for t in data["tags"]]
    assert tag_id not in tag_ids


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_list_tags_unauthenticated(client: TestClient) -> None:
    """未認証でタグ一覧を取得すると 401。"""
    resp = client.get("/api/v1/tags")

    assert resp.status_code == 401


def test_create_tag_unauthenticated(client: TestClient) -> None:
    """未認証でタグを作成すると 401。"""
    resp = client.post("/api/v1/tags", json={"name": "テスト"})

    assert resp.status_code == 401


def test_update_tag_unauthenticated(
    client: TestClient,
    sample_tags: list[dict],
) -> None:
    """未認証でタグを更新すると 401。"""
    tag_id = sample_tags[0]["id"]
    resp = client.patch(
        f"/api/v1/tags/{tag_id}",
        json={"name": "変更"},
    )

    assert resp.status_code == 401


def test_delete_tag_unauthenticated(
    client: TestClient,
    sample_tags: list[dict],
) -> None:
    """未認証でタグを削除すると 401。"""
    tag_id = sample_tags[0]["id"]
    resp = client.delete(f"/api/v1/tags/{tag_id}")

    assert resp.status_code == 401


def test_update_other_users_tag_returns_404(
    client: TestClient,
    sample_tags: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーのタグを更新しようとすると 404。"""
    tag_id = sample_tags[0]["id"]
    resp = client.patch(
        f"/api/v1/tags/{tag_id}",
        json={"name": "乗っ取り"},
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_delete_other_users_tag_returns_404(
    client: TestClient,
    sample_tags: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーのタグを削除しようとすると 404。"""
    tag_id = sample_tags[0]["id"]
    resp = client.delete(
        f"/api/v1/tags/{tag_id}",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_list_tags_scoped_to_user(
    client: TestClient,
    sample_tags: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """一覧で他ユーザーのタグが含まれない。"""
    resp = client.get("/api/v1/tags", headers=other_auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  バリデーションエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_tag_missing_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """name 未指定で 422。"""
    resp = client.post(
        "/api/v1/tags",
        json={},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_create_tag_empty_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """name が空文字で 422。"""
    resp = client.post(
        "/api/v1/tags",
        json={"name": ""},
        headers=auth_headers,
    )

    assert resp.status_code == 422


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ビジネスロジックエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_tag_duplicate_name(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """同一ユーザーで重複タグ名を作成すると 409。"""
    # sample_tags に「取引先」が存在
    resp = client.post(
        "/api/v1/tags",
        json={"name": "取引先"},
        headers=auth_headers,
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Tag already exists"


def test_update_tag_duplicate_name(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """更新先のタグ名が既存と重複で 409。"""
    # sample_tags[1] を sample_tags[0] と同名に変更
    tag_id = sample_tags[1]["id"]
    existing_name = sample_tags[0]["name"]
    resp = client.patch(
        f"/api/v1/tags/{tag_id}",
        json={"name": existing_name},
        headers=auth_headers,
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Tag already exists"


def test_create_tag_same_name_different_user(
    client: TestClient,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    """別ユーザーなら同名タグを作成できる。"""
    # ユーザー A が作成
    resp_a = client.post(
        "/api/v1/tags",
        json={"name": "共通タグ名"},
        headers=auth_headers,
    )
    assert resp_a.status_code == 201

    # ユーザー B が同名で作成
    resp_b = client.post(
        "/api/v1/tags",
        json={"name": "共通タグ名"},
        headers=other_auth_headers,
    )
    assert resp_b.status_code == 201


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_update_tag_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID のタグを更新すると 404。"""
    resp = client.patch(
        "/api/v1/tags/99999",
        json={"name": "存在しない"},
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Tag not found"


def test_delete_tag_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID のタグを削除すると 404。"""
    resp = client.delete(
        "/api/v1/tags/99999",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Tag not found"
