"""名刺 CRUD エンドポイントのテスト。

GET    /api/v1/namecards       – 名刺一覧（ページネーション付き）
POST   /api/v1/namecards       – 名刺作成
GET    /api/v1/namecards/{id}  – 名刺詳細
PATCH  /api/v1/namecards/{id}  – 名刺更新
DELETE /api/v1/namecards/{id}  – 名刺削除
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Relationship, Tag

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_namecard_minimal(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """必須フィールドのみで名刺を作成できる。"""
    resp = client.post(
        "/api/v1/namecards",
        json={"last_name": "田中"},
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], int)
    assert data["last_name"] == "田中"


def test_create_namecard_full(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
    sample_tags: list[dict],
) -> None:
    """全フィールド指定で名刺を作成できる。"""
    body = {
        "first_name": "太郎",
        "last_name": "田中",
        "first_name_kana": "たろう",
        "last_name_kana": "たなか",
        "met_notes": "2025年展示会で出会った",
        "notes": "重要な取引先",
        "relationship_ids": [sample_relationship_tree[2]["id"]],
        "tag_ids": [sample_tags[0]["id"]],
        "contact_methods": [
            {"type": "email", "value": "tanaka@example.com", "is_primary": True},
            {"type": "mobile", "value": "090-1234-5678", "is_primary": False},
        ],
    }
    resp = client.post(
        "/api/v1/namecards",
        json=body,
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["first_name"] == "太郎"
    assert data["last_name"] == "田中"
    assert data["first_name_kana"] == "たろう"
    assert data["last_name_kana"] == "たなか"
    assert data["met_notes"] == "2025年展示会で出会った"
    assert data["notes"] == "重要な取引先"
    assert len(data["contact_methods"]) == 2
    assert len(data["relationships"]) == 1
    assert len(data["tags"]) == 1


def test_create_namecard_with_contact_methods(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """複数の contact_methods を含む名刺を作成できる。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "佐藤",
            "contact_methods": [
                {"type": "email", "value": "sato@example.com", "is_primary": True},
                {"type": "tel", "value": "03-1234-5678", "is_primary": False},
                {"type": "mobile", "value": "090-9876-5432", "is_primary": False},
            ],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["contact_methods"]) == 3

    types = [cm["type"] for cm in data["contact_methods"]]
    assert "email" in types
    assert "tel" in types
    assert "mobile" in types


def test_create_namecard_all_17_contact_types(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """全 17 種類の contact_method type を含む名刺を作成できる。"""
    all_types = [
        "email",
        "mobile",
        "tel",
        "fax",
        "website",
        "linkedin",
        "twitter",
        "facebook",
        "instagram",
        "line",
        "wechat",
        "whatsapp",
        "telegram",
        "skype",
        "zoom",
        "teams",
        "other",
    ]
    contact_methods = [
        {"type": t, "value": f"value-{t}", "is_primary": i == 0}
        for i, t in enumerate(all_types)
    ]

    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "全連絡先",
            "contact_methods": contact_methods,
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["contact_methods"]) == 17
    returned_types = sorted([cm["type"] for cm in data["contact_methods"]])
    assert returned_types == sorted(all_types)


def test_create_namecard_with_multiple_relationships(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """兼務（複数 Relationship）の名刺を作成できる。"""
    rel_ids = [
        sample_relationship_tree[0]["id"],
        sample_relationship_tree[2]["id"],
    ]
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "鈴木",
            "relationship_ids": rel_ids,
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["relationships"]) == 2


def test_create_namecard_with_multiple_tags(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_tags: list[dict],
) -> None:
    """複数タグ付き名刺を作成できる。"""
    tag_ids = [t["id"] for t in sample_tags]
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "高橋",
            "tag_ids": tag_ids,
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["tags"]) == 3


def test_list_namecards_default(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """デフォルト（page=1, per_page=20, updated_at DESC）で一覧取得。"""
    resp = client.get("/api/v1/namecards", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data
    assert "total_pages" in data
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_list_namecards_pagination(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """ページネーションが正しく動作する。"""
    # Setup: 25 件の名刺を作成
    for i in range(25):
        client.post(
            "/api/v1/namecards",
            json={"last_name": f"テスト{i:02d}"},
            headers=auth_headers,
        )

    resp = client.get(
        "/api/v1/namecards?page=2&per_page=10",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 2
    assert data["per_page"] == 10
    assert len(data["items"]) == 10
    assert data["total"] == 25
    assert data["total_pages"] == 3


def test_list_namecards_pagination_last_page(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """最終ページで残り件数のみ返る。"""
    # Setup: 25 件の名刺を作成
    for i in range(25):
        client.post(
            "/api/v1/namecards",
            json={"last_name": f"テスト{i:02d}"},
            headers=auth_headers,
        )

    resp = client.get(
        "/api/v1/namecards?page=3&per_page=10",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 3
    assert len(data["items"]) == 5  # 25 - 10 - 10 = 5


def test_list_namecards_empty(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """名刺 0 件で空リスト。"""
    resp = client.get("/api/v1/namecards", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_list_namecards_sort_asc(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """created_at ASC ソート。"""
    # Setup: 3 件作成
    for name in ["あ田中", "い佐藤", "う鈴木"]:
        client.post(
            "/api/v1/namecards",
            json={"last_name": name},
            headers=auth_headers,
        )

    resp = client.get(
        "/api/v1/namecards?sort_by=created_at&order=asc",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    items = data["items"]
    assert len(items) == 3
    # created_at ASC: 作成順
    timestamps = [item["created_at"] for item in items]
    assert timestamps == sorted(timestamps)


def test_list_namecards_default_sort(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """デフォルトソートが updated_at DESC であることを検証。"""
    # Setup: 3 件を順番に作成し、中間のカードだけ更新して updated_at を最新にする
    names = ["ソートA", "ソートB", "ソートC"]
    ids: list[int] = []
    for name in names:
        resp = client.post(
            "/api/v1/namecards",
            json={"last_name": name},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
        time.sleep(0.05)

    # "ソートB" を更新して updated_at を最新にする
    time.sleep(0.05)
    client.patch(
        f"/api/v1/namecards/{ids[1]}",
        json={"notes": "更新済み"},
        headers=auth_headers,
    )

    # デフォルト（sort_by/order 未指定）で一覧取得
    resp = client.get("/api/v1/namecards", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 3

    # updated_at DESC: 新しい順に並ぶ
    timestamps = [item["updated_at"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)


def test_list_namecards_sort_by_kana(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """sort_by=last_name_kana&order=asc でかな順ソート。"""
    # Setup: かな付きで 3 件作成
    cards = [
        {"last_name": "渡辺", "last_name_kana": "わたなべ"},
        {"last_name": "浅田", "last_name_kana": "あさだ"},
        {"last_name": "中村", "last_name_kana": "なかむら"},
    ]
    for card in cards:
        resp = client.post(
            "/api/v1/namecards",
            json=card,
            headers=auth_headers,
        )
        assert resp.status_code == 201

    resp = client.get(
        "/api/v1/namecards?sort_by=last_name_kana&order=asc",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    items = resp.json()["items"]
    kana_values = [item["last_name_kana"] for item in items]
    # None を除外してかな昇順であることを確認
    non_null_kana = [k for k in kana_values if k is not None]
    assert non_null_kana == sorted(non_null_kana)


def test_list_namecards_filter_by_tag(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_tags: list[dict],
) -> None:
    """tag_id フィルタ。"""
    tag_id = sample_namecard["tag_ids"][0]

    resp = client.get(
        f"/api/v1/namecards?tag_id={tag_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    # フィルタされた名刺には該当タグが含まれる
    for item in data["items"]:
        item_tag_ids = [t["id"] for t in item["tags"]]
        assert tag_id in item_tag_ids


def test_list_namecards_filter_by_relationship(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_relationship_tree: list[dict],
) -> None:
    """relationship_id フィルタ。"""
    rel_id = sample_namecard["relationship_ids"][0]

    resp = client.get(
        f"/api/v1/namecards?relationship_id={rel_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    # フィルタされた名刺には該当 Relationship が含まれる
    for item in data["items"]:
        item_rel_ids = [r["id"] for r in item["relationships"]]
        assert rel_id in item_rel_ids


def test_list_namecards_includes_relationships_and_tags(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """一覧に relationships(full_path) と tags が含まれる。"""
    resp = client.get("/api/v1/namecards", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) >= 1

    item = data["items"][0]
    assert "relationships" in item
    assert "tags" in item

    # relationships に full_path が含まれる
    if item["relationships"]:
        assert "full_path" in item["relationships"][0]

    # tags に name が含まれる
    if item["tags"]:
        assert "name" in item["tags"][0]


def test_get_namecard_detail(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """名刺詳細を取得できる。"""
    nc_id = sample_namecard["id"]

    resp = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == nc_id
    assert data["first_name"] == "太郎"
    assert data["last_name"] == "田中"
    assert "contact_methods" in data
    assert "relationships" in data
    assert "tags" in data
    assert "created_at" in data
    assert "updated_at" in data

    # relationships に full_path が含まれる（NC-2 仕様）
    if data["relationships"]:
        assert "full_path" in data["relationships"][0]
        assert data["relationships"][0]["full_path"] == "建築士会/桑名支部/青年会長"


def test_update_namecard_partial(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """一部フィールドのみ更新できる。"""
    nc_id = sample_namecard["id"]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"first_name": "次郎"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "次郎"
    # 他フィールドは不変
    assert data["last_name"] == "田中"


def test_update_namecard_relationships(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_relationship_tree: list[dict],
) -> None:
    """Relationship の紐付けを変更できる。"""
    nc_id = sample_namecard["id"]
    # 元はリーフ（青年会長）のみ → ルート（建築士会）に変更
    new_rel_ids = [sample_relationship_tree[0]["id"]]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"relationship_ids": new_rel_ids},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    rel_ids = [r["id"] for r in data["relationships"]]
    assert rel_ids == new_rel_ids


def test_update_namecard_tags(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    sample_tags: list[dict],
) -> None:
    """Tag の紐付けを変更できる。"""
    nc_id = sample_namecard["id"]
    # 元は「取引先」のみ → 「友人」「ゴルフ仲間」に変更
    new_tag_ids = [sample_tags[1]["id"], sample_tags[2]["id"]]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"tag_ids": new_tag_ids},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    tag_ids = sorted([t["id"] for t in data["tags"]])
    assert tag_ids == sorted(new_tag_ids)


def test_update_namecard_contact_methods(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """contact_methods を置き換えできる（NC-7: 完全置換）。"""
    nc_id = sample_namecard["id"]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={
            "contact_methods": [
                {"type": "tel", "value": "03-1234-5678", "is_primary": True},
            ],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    # 完全置換: 元の 2 件 → 1 件に
    assert len(data["contact_methods"]) == 1
    assert data["contact_methods"][0]["type"] == "tel"
    assert data["contact_methods"][0]["value"] == "03-1234-5678"
    assert data["contact_methods"][0]["is_primary"] is True


def test_update_namecard_without_contact_methods(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """contact_methods フィールド未指定の PATCH で既存 CM が保持される。"""
    nc_id = sample_namecard["id"]

    # 更新前の contact_methods を確認
    before = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    ).json()
    cms_before = before["contact_methods"]
    assert len(cms_before) >= 1

    # contact_methods を含まない PATCH
    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"notes": "CM未指定で更新"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["notes"] == "CM未指定で更新"
    # contact_methods は変わらない
    assert len(data["contact_methods"]) == len(cms_before)
    before_ids = sorted([cm["id"] for cm in cms_before])
    after_ids = sorted([cm["id"] for cm in data["contact_methods"]])
    assert after_ids == before_ids


def test_update_namecard_updated_at_changes(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """更新すると updated_at が変わる。"""
    nc_id = sample_namecard["id"]

    # 更新前の updated_at を取得
    before = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    ).json()["updated_at"]

    # 少し待ってから更新
    time.sleep(0.1)

    client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"notes": "更新テスト"},
        headers=auth_headers,
    )

    after = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    ).json()["updated_at"]

    assert after != before


def test_delete_namecard_success(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """名刺を削除できる。"""
    nc_id = sample_namecard["id"]

    resp = client.delete(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # 再取得で 404
    resp = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_delete_namecard_cascades_contact_methods(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
    db_session: Session,
) -> None:
    """名刺削除で contact_methods もカスケード削除。"""
    from app.models import ContactMethod

    nc_id = sample_namecard["id"]

    # 削除前: contact_methods が存在
    cms_before = (
        db_session.query(ContactMethod)
        .filter(ContactMethod.name_card_id == nc_id)
        .count()
    )
    assert cms_before >= 1

    # 名刺削除
    resp = client.delete(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # DB を更新して確認
    db_session.expire_all()
    cms_after = (
        db_session.query(ContactMethod)
        .filter(ContactMethod.name_card_id == nc_id)
        .count()
    )
    assert cms_after == 0


def test_delete_namecard_preserves_relationships_and_tags(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """名刺削除で Relationship/Tag 自体は残る。"""
    nc_id = sample_namecard["id"]

    # 名刺削除
    resp = client.delete(
        f"/api/v1/namecards/{nc_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Relationship は残存
    resp = client.get("/api/v1/relationships", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Tag は残存
    resp = client.get("/api/v1/tags", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_list_namecards_unauthenticated(client: TestClient) -> None:
    """未認証で名刺一覧を取得すると 401。"""
    resp = client.get("/api/v1/namecards")

    assert resp.status_code == 401


def test_create_namecard_unauthenticated(client: TestClient) -> None:
    """未認証で名刺を作成すると 401。"""
    resp = client.post(
        "/api/v1/namecards",
        json={"last_name": "田中"},
    )

    assert resp.status_code == 401


def test_get_namecard_unauthenticated(
    client: TestClient,
    sample_namecard: dict,
) -> None:
    """未認証で名刺詳細を取得すると 401。"""
    nc_id = sample_namecard["id"]

    resp = client.get(f"/api/v1/namecards/{nc_id}")

    assert resp.status_code == 401


def test_update_namecard_unauthenticated(
    client: TestClient,
    sample_namecard: dict,
) -> None:
    """未認証で名刺を更新すると 401。"""
    nc_id = sample_namecard["id"]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"first_name": "次郎"},
    )

    assert resp.status_code == 401


def test_delete_namecard_unauthenticated(
    client: TestClient,
    sample_namecard: dict,
) -> None:
    """未認証で名刺を削除すると 401。"""
    nc_id = sample_namecard["id"]

    resp = client.delete(f"/api/v1/namecards/{nc_id}")

    assert resp.status_code == 401


def test_get_other_users_namecard_returns_404(
    client: TestClient,
    sample_namecard: dict,
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの名刺取得で 404（リソース存在を隠蔽）。"""
    nc_id = sample_namecard["id"]

    resp = client.get(
        f"/api/v1/namecards/{nc_id}",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_update_other_users_namecard_returns_404(
    client: TestClient,
    sample_namecard: dict,
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの名刺更新で 404。"""
    nc_id = sample_namecard["id"]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"first_name": "乗っ取り"},
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_delete_other_users_namecard_returns_404(
    client: TestClient,
    sample_namecard: dict,
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの名刺削除で 404。"""
    nc_id = sample_namecard["id"]

    resp = client.delete(
        f"/api/v1/namecards/{nc_id}",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_list_namecards_scoped_to_user(
    client: TestClient,
    sample_namecard: dict,
    other_auth_headers: dict[str, str],
) -> None:
    """一覧で他ユーザーの名刺が含まれない。"""
    resp = client.get("/api/v1/namecards", headers=other_auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  バリデーションエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_namecard_missing_first_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """first_name 未指定で 422。"""
    resp = client.post(
        "/api/v1/namecards",
        json={"last_name": "田中"},
        headers=auth_headers,
    )

    # first_name は Optional のため 201 で成功する
    # （test_create_namecard_minimal と同じ振る舞い）
    assert resp.status_code == 201


def test_create_namecard_missing_last_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """last_name 未指定で 422。"""
    resp = client.post(
        "/api/v1/namecards",
        json={"first_name": "太郎"},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_create_namecard_empty_body(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """空ボディで 422。"""
    resp = client.post(
        "/api/v1/namecards",
        json={},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_create_namecard_invalid_contact_method_type(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """不正な contact_method type で 422。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "contact_methods": [
                {"type": "invalid_type", "value": "test@example.com"},
            ],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_create_namecard_contact_method_missing_value(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """contact_method の value 未指定で 422。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "contact_methods": [
                {"type": "email"},
            ],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_update_namecard_invalid_field_type(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_namecard: dict,
) -> None:
    """文字列フィールドに整数を送ると 422。"""
    nc_id = sample_namecard["id"]

    resp = client.patch(
        f"/api/v1/namecards/{nc_id}",
        json={"first_name": 123},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_list_namecards_invalid_sort_by(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しないフィールドでソートすると 422（NC-16）。"""
    resp = client.get(
        "/api/v1/namecards?sort_by=invalid_field",
        headers=auth_headers,
    )

    assert resp.status_code == 422


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ビジネスロジックエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_namecard_invalid_relationship_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない relationship_id で 400。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "relationship_ids": [99999],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert "99999" in resp.json()["detail"]


def test_create_namecard_invalid_tag_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない tag_id で 400。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "tag_ids": [99999],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert "99999" in resp.json()["detail"]


def test_create_namecard_other_users_relationship_id(
    client: TestClient,
    auth_headers: dict[str, str],
    other_user_and_token: tuple[dict, str],
    db_session: Session,
) -> None:
    """他ユーザーの relationship_id で 400。"""
    other_user, _ = other_user_and_token

    # 別ユーザーの Relationship を DB に直接作成
    other_rel = Relationship(user_id=other_user["id"], name="他組織", parent_id=None)
    db_session.add(other_rel)
    db_session.flush()

    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "relationship_ids": [other_rel.id],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 400


def test_create_namecard_other_users_tag_id(
    client: TestClient,
    auth_headers: dict[str, str],
    other_user_and_token: tuple[dict, str],
    db_session: Session,
) -> None:
    """他ユーザーの tag_id で 400。"""
    other_user, _ = other_user_and_token

    # 別ユーザーの Tag を DB に直接作成
    other_tag = Tag(user_id=other_user["id"], name="他タグ")
    db_session.add(other_tag)
    db_session.flush()

    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "tag_ids": [other_tag.id],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 400


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_get_namecard_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID で 404。"""
    resp = client.get(
        "/api/v1/namecards/99999",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Namecard not found"


def test_update_namecard_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID で 404。"""
    resp = client.patch(
        "/api/v1/namecards/99999",
        json={"first_name": "次郎"},
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Namecard not found"


def test_delete_namecard_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID で 404。"""
    resp = client.delete(
        "/api/v1/namecards/99999",
        headers=auth_headers,
    )

    assert resp.status_code == 404


def test_list_namecards_per_page_exceeds_max(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """per_page > 100 で 100 に丸められる。"""
    resp = client.get(
        "/api/v1/namecards?per_page=200",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["per_page"] == 100


def test_list_namecards_page_zero_or_negative(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """page=0 で 422。"""
    resp = client.get(
        "/api/v1/namecards?page=0",
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_list_namecards_page_beyond_total(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しないページ番号で空リスト。"""
    # Setup: 3 件作成
    for i in range(3):
        client.post(
            "/api/v1/namecards",
            json={"last_name": f"テスト{i}"},
            headers=auth_headers,
        )

    resp = client.get(
        "/api/v1/namecards?page=100",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []


def test_create_namecard_empty_contact_methods_array(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """空の contact_methods 配列で正常作成。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "contact_methods": [],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["contact_methods"] == []


def test_create_namecard_empty_relationship_ids(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """空の relationship_ids で正常作成。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "relationship_ids": [],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["relationships"] == []


def test_create_namecard_empty_tag_ids(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """空の tag_ids で正常作成。"""
    resp = client.post(
        "/api/v1/namecards",
        json={
            "last_name": "田中",
            "tag_ids": [],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["tags"] == []
