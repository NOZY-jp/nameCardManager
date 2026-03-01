"""Relationship エンドポイントのテスト。

GET    /api/v1/relationships       – ルートノード一覧（ページネーションなし）
GET    /api/v1/relationships/tree   – ネスト構造のツリー
POST   /api/v1/relationships        – ノード作成
PATCH  /api/v1/relationships/{id}   – ノード更新
DELETE /api/v1/relationships/{id}   – リーフノード削除
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Relationship


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系（13 ケース）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_relationship_root(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """ルートノード（parent_id=null）を作成できる。"""
    resp = client.post(
        "/api/v1/relationships",
        json={"name": "建築士会", "parent_id": None},
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "建築士会"
    assert data["parent_id"] is None
    assert data["full_path"] == "建築士会"
    assert isinstance(data["id"], int)


def test_create_relationship_child(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """子ノードを作成できる。"""
    # Setup: ルートノード作成
    root = client.post(
        "/api/v1/relationships",
        json={"name": "建築士会", "parent_id": None},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/api/v1/relationships",
        json={"name": "桑名支部", "parent_id": root["id"]},
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "桑名支部"
    assert data["parent_id"] == root["id"]
    assert data["full_path"] == "建築士会/桑名支部"


def test_create_relationship_grandchild(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """孫ノード（3階層）を作成できる。"""
    # Setup: 2階層作成
    root = client.post(
        "/api/v1/relationships",
        json={"name": "建築士会", "parent_id": None},
        headers=auth_headers,
    ).json()
    child = client.post(
        "/api/v1/relationships",
        json={"name": "桑名支部", "parent_id": root["id"]},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/api/v1/relationships",
        json={"name": "青年会長", "parent_id": child["id"]},
        headers=auth_headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["full_path"] == "建築士会/桑名支部/青年会長"


def test_list_relationships_root_nodes(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """ルートノード一覧を取得できる（children 含まず、ページネーションなし）。"""
    resp = client.get("/api/v1/relationships", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    # 配列形式（ページネーションなし, NC-5）
    assert isinstance(data, list)
    # sample_relationship_tree はルート1件
    assert len(data) == 1
    assert data[0]["name"] == "建築士会"
    assert data[0]["parent_id"] is None
    assert "full_path" in data[0]


def test_list_relationships_empty(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """Relationship 0件で空リスト。"""
    resp = client.get("/api/v1/relationships", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_relationship_tree(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """ネストされたツリー構造を取得できる。"""
    resp = client.get("/api/v1/relationships/tree", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1

    root = data[0]
    assert root["name"] == "建築士会"
    assert "children" in root
    assert len(root["children"]) == 1

    child = root["children"][0]
    assert child["name"] == "桑名支部"
    assert len(child["children"]) == 1

    grandchild = child["children"][0]
    assert grandchild["name"] == "青年会長"
    assert grandchild["children"] == []


def test_get_relationship_tree_empty(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """ツリーが空のとき空配列。"""
    resp = client.get("/api/v1/relationships/tree", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_relationship_tree_full_path(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """ツリーの各ノードに full_path が含まれる。"""
    resp = client.get("/api/v1/relationships/tree", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()

    root = data[0]
    assert root["full_path"] == "建築士会"

    child = root["children"][0]
    assert child["full_path"] == "建築士会/桑名支部"

    grandchild = child["children"][0]
    assert grandchild["full_path"] == "建築士会/桑名支部/青年会長"


def test_update_relationship_name(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """ノード名を変更できる。"""
    node_id = sample_relationship_tree[0]["id"]

    resp = client.patch(
        f"/api/v1/relationships/{node_id}",
        json={"name": "新名称"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["name"] == "新名称"


def test_update_relationship_parent(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """親を変更できる（ツリー移動）。"""
    # Setup: 2つのルートノードを作成
    root_a = client.post(
        "/api/v1/relationships",
        json={"name": "組織A", "parent_id": None},
        headers=auth_headers,
    ).json()
    root_b = client.post(
        "/api/v1/relationships",
        json={"name": "組織B", "parent_id": None},
        headers=auth_headers,
    ).json()
    child = client.post(
        "/api/v1/relationships",
        json={"name": "部署X", "parent_id": root_a["id"]},
        headers=auth_headers,
    ).json()

    # 部署Xを組織Bの子に移動
    resp = client.patch(
        f"/api/v1/relationships/{child['id']}",
        json={"parent_id": root_b["id"]},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["parent_id"] == root_b["id"]
    assert data["full_path"] == "組織B/部署X"


def test_update_relationship_to_root(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """親を null に変更しルートノードにできる。"""
    child_id = sample_relationship_tree[1]["id"]  # 桑名支部

    resp = client.patch(
        f"/api/v1/relationships/{child_id}",
        json={"parent_id": None},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["parent_id"] is None
    assert data["full_path"] == "桑名支部"


def test_delete_relationship_leaf(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """リーフノードを削除できる。"""
    leaf_id = sample_relationship_tree[2]["id"]  # 青年会長

    resp = client.delete(
        f"/api/v1/relationships/{leaf_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 204


def test_delete_relationship_preserves_parent(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """リーフ削除後、親ノードは残る。"""
    leaf_id = sample_relationship_tree[2]["id"]  # 青年会長
    parent_id = sample_relationship_tree[1]["id"]  # 桑名支部

    # リーフ削除
    client.delete(f"/api/v1/relationships/{leaf_id}", headers=auth_headers)

    # 親はまだ存在する
    resp = client.get("/api/v1/relationships/tree", headers=auth_headers)
    assert resp.status_code == 200
    tree = resp.json()
    assert len(tree) == 1

    child = tree[0]["children"][0]
    assert child["id"] == parent_id
    assert child["children"] == []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー（8 ケース）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_list_relationships_unauthenticated(client: TestClient) -> None:
    """未認証で 401。"""
    resp = client.get("/api/v1/relationships")
    assert resp.status_code == 401


def test_get_relationship_tree_unauthenticated(client: TestClient) -> None:
    """未認証で 401。"""
    resp = client.get("/api/v1/relationships/tree")
    assert resp.status_code == 401


def test_create_relationship_unauthenticated(client: TestClient) -> None:
    """未認証で 401。"""
    resp = client.post(
        "/api/v1/relationships",
        json={"name": "テスト", "parent_id": None},
    )
    assert resp.status_code == 401


def test_update_relationship_unauthenticated(
    client: TestClient,
    sample_relationship_tree: list[dict],
) -> None:
    """未認証で 401。"""
    node_id = sample_relationship_tree[0]["id"]
    resp = client.patch(
        f"/api/v1/relationships/{node_id}",
        json={"name": "更新"},
    )
    assert resp.status_code == 401


def test_delete_relationship_unauthenticated(
    client: TestClient,
    sample_relationship_tree: list[dict],
) -> None:
    """未認証で 401。"""
    node_id = sample_relationship_tree[2]["id"]
    resp = client.delete(f"/api/v1/relationships/{node_id}")
    assert resp.status_code == 401


def test_update_other_users_relationship_returns_404(
    client: TestClient,
    sample_relationship_tree: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの Relationship 更新で 404。"""
    node_id = sample_relationship_tree[0]["id"]

    resp = client.patch(
        f"/api/v1/relationships/{node_id}",
        json={"name": "乗っ取り"},
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_delete_other_users_relationship_returns_404(
    client: TestClient,
    sample_relationship_tree: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの Relationship 削除で 404。"""
    leaf_id = sample_relationship_tree[2]["id"]

    resp = client.delete(
        f"/api/v1/relationships/{leaf_id}",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_list_relationships_scoped_to_user(
    client: TestClient,
    sample_relationship_tree: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """一覧で他ユーザーの Relationship が含まれない。"""
    resp = client.get("/api/v1/relationships", headers=other_auth_headers)

    assert resp.status_code == 200
    assert resp.json() == []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  バリデーションエラー（2 ケース）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_create_relationship_missing_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """name 未指定で 422。"""
    resp = client.post(
        "/api/v1/relationships",
        json={"parent_id": None},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_create_relationship_empty_name(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """name が空文字で 422。"""
    resp = client.post(
        "/api/v1/relationships",
        json={"name": "", "parent_id": None},
        headers=auth_headers,
    )

    assert resp.status_code == 422


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ビジネスロジックエラー（6 ケース）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_delete_relationship_with_children_returns_400(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """子孫がある場合は 400。"""
    root_id = sample_relationship_tree[0]["id"]  # 建築士会（子あり）

    resp = client.delete(
        f"/api/v1/relationships/{root_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Cannot delete node with children"


def test_delete_relationship_root_with_children_returns_400(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """ルートノードに子がある場合は 400（中間ノード削除も同様）。"""
    mid_id = sample_relationship_tree[1]["id"]  # 桑名支部（中間ノード、子あり）

    resp = client.delete(
        f"/api/v1/relationships/{mid_id}",
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Cannot delete node with children"


def test_update_relationship_circular_reference_self(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """自分自身を親にできない。"""
    node_id = sample_relationship_tree[0]["id"]

    resp = client.patch(
        f"/api/v1/relationships/{node_id}",
        json={"parent_id": node_id},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Circular reference detected"


def test_update_relationship_circular_reference_descendant(
    client: TestClient,
    auth_headers: dict[str, str],
    sample_relationship_tree: list[dict],
) -> None:
    """子孫を親にできない（循環参照）。"""
    root_id = sample_relationship_tree[0]["id"]  # 建築士会
    leaf_id = sample_relationship_tree[2]["id"]  # 青年会長

    # ルートの親をリーフに変更 → 循環参照
    resp = client.patch(
        f"/api/v1/relationships/{root_id}",
        json={"parent_id": leaf_id},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Circular reference detected"


def test_create_relationship_invalid_parent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない parent_id で 400。"""
    resp = client.post(
        "/api/v1/relationships",
        json={"name": "テスト", "parent_id": 99999},
        headers=auth_headers,
    )

    assert resp.status_code == 400


def test_create_relationship_other_users_parent_id(
    client: TestClient,
    auth_headers: dict[str, str],
    other_user_and_token: tuple[dict, str],
    db_session: Session,
) -> None:
    """他ユーザーの parent_id で 400。"""
    other_user, _ = other_user_and_token

    # 別ユーザーの Relationship を DB に直接作成
    other_rel = Relationship(user_id=other_user["id"], name="他組織", parent_id=None)
    db_session.add(other_rel)
    db_session.flush()

    resp = client.post(
        "/api/v1/relationships",
        json={"name": "子ノード", "parent_id": other_rel.id},
        headers=auth_headers,
    )

    assert resp.status_code == 400


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース（3 ケース）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_delete_relationship_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID で 404。"""
    resp = client.delete(
        "/api/v1/relationships/99999",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Relationship not found"


def test_update_relationship_nonexistent_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない ID で 404。"""
    resp = client.patch(
        "/api/v1/relationships/99999",
        json={"name": "更新"},
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Relationship not found"


def test_relationship_deep_nesting(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """深い階層（5階層以上）でも正しく full_path を構築。"""
    names = ["L1", "L2", "L3", "L4", "L5", "L6"]
    parent_id = None

    for name in names:
        resp = client.post(
            "/api/v1/relationships",
            json={"name": name, "parent_id": parent_id},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        parent_id = resp.json()["id"]

    # ツリーで確認
    tree_resp = client.get("/api/v1/relationships/tree", headers=auth_headers)
    assert tree_resp.status_code == 200

    # 最深ノードまでたどる
    node = tree_resp.json()[0]
    for _ in range(len(names) - 1):
        assert len(node["children"]) == 1
        node = node["children"][0]

    expected_path = "/".join(names)
    assert node["full_path"] == expected_path
    assert node["children"] == []


def test_tree_shows_only_own_relationships(
    client: TestClient,
    sample_relationship_tree: list[dict],
    other_auth_headers: dict[str, str],
) -> None:
    """ツリーで他ユーザーの Relationship が含まれない。"""
    resp = client.get("/api/v1/relationships/tree", headers=other_auth_headers)

    assert resp.status_code == 200
    assert resp.json() == []
