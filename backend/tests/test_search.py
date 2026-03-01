"""検索エンドポイントのテスト。

GET /api/v1/search – テキスト検索 + フィルタリング
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ContactMethod, NameCard, Relationship, Tag


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_search_by_last_name(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """姓で検索できる。"""
    resp = client.get("/api/v1/search?q=田中", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(item["last_name"] == "田中" for item in data["items"])


def test_search_by_first_name(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """名で検索できる。"""
    resp = client.get("/api/v1/search?q=太郎", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(item["first_name"] == "太郎" for item in data["items"])


def test_search_by_kana(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """カナで検索できる。"""
    resp = client.get("/api/v1/search?q=たなか", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(item["last_name_kana"] == "たなか" for item in data["items"])


def test_search_by_relationship_full_path(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """Relationship の full_path で検索できる。"""
    resp = client.get("/api/v1/search?q=建築士会", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_by_contact_method_value(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """ContactMethod の value で検索できる。"""
    resp = client.get(
        "/api/v1/search?q=tanaka@example.com",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_by_notes(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """notes で検索できる。"""
    resp = client.get("/api/v1/search?q=重要な取引先", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_by_met_notes(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """met_notes で検索できる。"""
    resp = client.get("/api/v1/search?q=展示会", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_partial_match(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """部分一致検索ができる。"""
    resp = client.get("/api/v1/search?q=田", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(item["last_name"] == "田中" for item in data["items"])


def test_search_filter_by_tag_ids(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_tags: list[dict],
) -> None:
    """tag_ids でフィルタリングできる。"""
    tag_id = sample_namecard["tag_ids"][0]
    resp = client.get(
        f"/api/v1/search?tag_ids={tag_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    # フィルタ指定したタグが各名刺に含まれていること
    for item in data["items"]:
        item_tag_ids = [t["id"] for t in item["tags"]]
        assert tag_id in item_tag_ids


def test_search_filter_by_multiple_tag_ids(
    client: TestClient,
    db_session: Session,
    auth_headers: dict[str, str],
    user_and_token: tuple[dict, str],
    sample_tags: list[dict],
) -> None:
    """複数 tag_ids（カンマ区切り）でフィルタリングできる (NC-10)。"""
    user_dict, _ = user_and_token

    # tag_ids[0] を持つ名刺
    nc1 = NameCard(
        user_id=user_dict["id"],
        first_name="一郎",
        last_name="佐藤",
        first_name_kana="いちろう",
        last_name_kana="さとう",
    )
    db_session.add(nc1)
    db_session.flush()
    tag_a = db_session.get(Tag, sample_tags[0]["id"])
    if tag_a is not None:
        nc1.tags.append(tag_a)

    # tag_ids[1] を持つ名刺
    nc2 = NameCard(
        user_id=user_dict["id"],
        first_name="二郎",
        last_name="鈴木",
        first_name_kana="じろう",
        last_name_kana="すずき",
    )
    db_session.add(nc2)
    db_session.flush()
    tag_b = db_session.get(Tag, sample_tags[1]["id"])
    if tag_b is not None:
        nc2.tags.append(tag_b)

    # どちらのタグも持たない名刺
    nc3 = NameCard(
        user_id=user_dict["id"],
        first_name="三郎",
        last_name="高橋",
        first_name_kana="さぶろう",
        last_name_kana="たかはし",
    )
    db_session.add(nc3)
    db_session.flush()
    tag_c = db_session.get(Tag, sample_tags[2]["id"])
    if tag_c is not None:
        nc3.tags.append(tag_c)

    db_session.flush()

    tid1 = sample_tags[0]["id"]
    tid2 = sample_tags[1]["id"]
    resp = client.get(
        f"/api/v1/search?tag_ids={tid1},{tid2}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    # 返却される名刺が指定タグのいずれかを含むこと
    for item in data["items"]:
        item_tag_ids = [t["id"] for t in item["tags"]]
        assert tid1 in item_tag_ids or tid2 in item_tag_ids


def test_search_filter_by_relationship_ids(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_relationship_tree: list[dict],
) -> None:
    """relationship_ids でフィルタリングできる。"""
    rel_id = sample_namecard["relationship_ids"][0]
    resp = client.get(
        f"/api/v1/search?relationship_ids={rel_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    # フィルタ指定した Relationship が各名刺に含まれていること
    for item in data["items"]:
        item_rel_ids = [r["id"] for r in item["relationships"]]
        assert rel_id in item_rel_ids


def test_search_filter_by_created_at_range(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """created_at の範囲フィルタ。"""
    now = datetime.now(tz=timezone.utc)
    start = (now - timedelta(hours=1)).isoformat()
    end = (now + timedelta(hours=1)).isoformat()

    resp = client.get(
        f"/api/v1/search?created_at_start={start}&created_at_end={end}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_filter_by_updated_at_range(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """updated_at の範囲フィルタ。"""
    now = datetime.now(tz=timezone.utc)
    start = (now - timedelta(hours=1)).isoformat()
    end = (now + timedelta(hours=1)).isoformat()

    resp = client.get(
        f"/api/v1/search?updated_at_start={start}&updated_at_end={end}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_combined_text_and_filter(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_tags: list[dict],
) -> None:
    """テキスト検索 + フィルタの複合検索。"""
    tag_id = sample_namecard["tag_ids"][0]
    resp = client.get(
        f"/api/v1/search?q=田中&tag_ids={tag_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["last_name"] == "田中"
        item_tag_ids = [t["id"] for t in item["tags"]]
        assert tag_id in item_tag_ids


def test_search_pagination(
    client: TestClient,
    db_session: Session,
    auth_headers: dict[str, str],
    user_and_token: tuple[dict, str],
) -> None:
    """検索結果のページネーション。"""
    user_dict, _ = user_and_token

    # 25 件の名刺を作成
    for i in range(25):
        nc = NameCard(
            user_id=user_dict["id"],
            first_name=f"名前{i}",
            last_name="テスト",
            first_name_kana=f"なまえ{i}",
            last_name_kana="てすと",
        )
        db_session.add(nc)
    db_session.flush()

    # page=2, per_page=10 → 10 件（2 ページ目）
    resp = client.get(
        "/api/v1/search?q=テスト&page=2&per_page=10",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 25
    assert data["page"] == 2
    assert data["per_page"] == 10
    assert len(data["items"]) == 10
    assert data["total_pages"] == 3


def test_search_no_results(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """該当なしで空リスト。"""
    resp = client.get(
        "/api/v1/search?q=存在しないキーワード",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_search_no_query_returns_all(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """q パラメータなしで全件返す。"""
    resp = client.get("/api/v1/search", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_search_unauthenticated(client: TestClient) -> None:
    """未認証で 401。"""
    resp = client.get("/api/v1/search?q=test")

    assert resp.status_code == 401


def test_search_scoped_to_user(
    client: TestClient,
    sample_namecard: dict,
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの名刺が検索結果に含まれない。"""
    resp = client.get(
        "/api/v1/search?q=田中",
        headers=other_auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_search_empty_query_string(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """q="" で全件返す。"""
    resp = client.get("/api/v1/search?q=", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


def test_search_special_characters(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """SQL インジェクション的文字列で安全に動作する。"""
    resp = client.get(
        "/api/v1/search?q=' OR 1=1 --",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    # インジェクションが成功しないこと（全件返らない or 正常レスポンス）
    assert isinstance(data["items"], list)
    assert isinstance(data["total"], int)


def test_search_invalid_tag_ids_format(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """tag_ids に非数値を含む場合 422 を返す (NC-10)。"""
    # NC-10: カンマ区切りの tag_ids に非数値 "abc" が混在
    resp = client.get(
        "/api/v1/search?tag_ids=1,abc,3",
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_search_empty_tag_ids(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """tag_ids= (空文字列) でフィルタ無視 → 全件返却 (NC-10)。"""
    # NC-10: 空文字列の tag_ids はフィルタとして無視される
    resp = client.get(
        "/api/v1/search?tag_ids=",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
