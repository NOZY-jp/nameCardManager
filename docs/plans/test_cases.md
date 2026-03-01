# Phase 1 バックエンド テストケース一覧

> 作成日: 2026-02-28
> 対象: nameCardManager Phase 1 — pytest + TestClient
> 関連: [API仕様](./momus.md)（分野1-9） / [フロントエンドテスト](./frontend_test_cases.md) / [Phase計画](../../.sisyphus/plans/namecard_manager_phase1.md)
>
> **技術スタック**: FastAPI / SQLAlchemy / PostgreSQL (pg_bigm) / pytest + httpx
>
> **⚠️ [NC-15] 422 バリデーションエラー形式**: FastAPI デフォルト形式に従う。`{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`
> **⚠️ [NC-3] pytest ファイル命名**: `test_*.py` パターン（`pyproject.toml` の `python_files` を更新すること）

---

## テスト構成

```
backend/tests/
├── conftest.py                     # DB, TestClient, fixture
├── test_auth.py                    # 11 ケース
├── test_namecards.py               # 45 ケース
├── test_relationships.py           # 29 ケース
├── test_tags.py                    # 20 ケース
├── test_search.py                  # 20 ケース
├── test_images.py                  # 22 ケース
├── test_export_import.py           # 16 ケース
└── test_health.py                  # 2 ケース
```

---

## 共通 Fixture（conftest.py）

| Fixture | スコープ | 説明 |
|---------|---------|------|
| `db_session` | function | テストごとにロールバックされる DB セッション（`SessionLocal` を override） |
| `client` | function | `TestClient` + DB セッション override 済み |
| `user_and_token` | function | `POST /auth/register` で登録済みユーザー + JWT トークン |
| `auth_headers` | function | `{"Authorization": "Bearer <token>"}` |
| `other_user_and_token` | function | 別ユーザー（権限テスト用） |
| `other_auth_headers` | function | 別ユーザーの認証ヘッダー `{"Authorization": "Bearer <other_token>"}` |
| `sample_relationship_tree` | function | 3 階層のツリー（建築士会 → 桑名支部 → 青年会長） |
| `sample_tags` | function | 3 つのタグ（取引先、友人、ゴルフ仲間） |
| `sample_namecard` | function | 名刺 1 件（contact_methods, relationships, tags 全関連付き） |

### Fixture 実装概要

```python
@pytest.fixture
def db_session():
    """テストごとにトランザクションをロールバック"""
    engine = create_engine(TEST_DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session):
    """TestClient with DB session override"""
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def user_and_token(client):
    """テストユーザー登録 + トークン取得"""
    res = client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "testpass123"
    })
    token = res.json()["access_token"]
    user_id = res.json()["user"]["id"]
    return {"user_id": user_id, "token": token}

@pytest.fixture
def auth_headers(user_and_token):
    return {"Authorization": f"Bearer {user_and_token['token']}"}

@pytest.fixture
def other_user_and_token(client):
    """別ユーザー（権限テスト用）"""
    res = client.post("/auth/register", json={
        "email": "other@example.com",
        "password": "otherpass123"
    })
    token = res.json()["access_token"]
    user_id = res.json()["user"]["id"]
    return {"user_id": user_id, "token": token}

@pytest.fixture
def other_auth_headers(other_user_and_token):
    return {"Authorization": f"Bearer {other_user_and_token['token']}"}

@pytest.fixture
def sample_relationship_tree(client, auth_headers):
    """3階層ツリー: 建築士会 → 桑名支部 → 青年会長"""
    r1 = client.post("/api/v1/relationships", json={"name": "建築士会", "parent_id": None}, headers=auth_headers)
    r2 = client.post("/api/v1/relationships", json={"name": "桑名支部", "parent_id": r1.json()["id"]}, headers=auth_headers)
    r3 = client.post("/api/v1/relationships", json={"name": "青年会長", "parent_id": r2.json()["id"]}, headers=auth_headers)
    return [r1.json(), r2.json(), r3.json()]

@pytest.fixture
def sample_tags(client, auth_headers):
    """3つのタグ"""
    tags = []
    for name in ["取引先", "友人", "ゴルフ仲間"]:
        res = client.post("/api/v1/tags", json={"name": name}, headers=auth_headers)
        tags.append(res.json())
    return tags

@pytest.fixture
def sample_namecard(client, auth_headers, sample_relationship_tree, sample_tags):
    """名刺1件（全関連付き）"""
    res = client.post("/api/v1/namecards", json={
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
            {"type": "mobile", "value": "090-1234-5678", "is_primary": False}
        ]
    }, headers=auth_headers)
    return res.json()
```

---

## test_auth.py（11 ケース）

### 正常系（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_register_success` | なし | `POST /auth/register` `{"email": "new@example.com", "password": "pass123"}` | 201; `access_token` と `user` を含む |
| 2 | `test_login_success` | ユーザー登録済み | `POST /auth/login` `{"email": "test@example.com", "password": "testpass123"}` | 200; `access_token` を含む |
| 3 | `test_get_current_user` | 認証済み | `GET /auth/me` + `auth_headers` | 200; ユーザー情報（`id`, `email`） |

### バリデーションエラー（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 4 | `test_register_missing_email` | なし | `POST /auth/register` `{"password": "pass123"}` | 422; `loc: ["body", "email"]` |
| 5 | `test_register_missing_password` | なし | `POST /auth/register` `{"email": "new@example.com"}` | 422; `loc: ["body", "password"]` |
| 6 | `test_login_wrong_password` | ユーザー登録済み | `POST /auth/login` `{"email": "test@example.com", "password": "wrongpass"}` | 401; `{"detail": "..."}` |

### エッジケース（5 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 7 | `test_register_duplicate_email` | ユーザー登録済み | `POST /auth/register` 同じ email | 409; `{"detail": "Email already exists"}` |
| 8 | `test_login_nonexistent_user` | なし | `POST /auth/login` 存在しない email | 401; `{"detail": "..."}` |
| 9 | `test_access_protected_endpoint_without_token` | なし | `GET /api/v1/namecards`（ヘッダーなし） | 401 |
| 10 | `test_access_with_invalid_token` | なし | `GET /api/v1/namecards` + `{"Authorization": "Bearer invalid"}` | 401 |
| 11 | `test_access_with_expired_token` | 期限切れトークン生成 | `GET /api/v1/namecards` + 期限切れトークン | 401 |

---

## test_namecards.py（45 ケース）

### 正常系（18 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_create_namecard_minimal` | `auth_headers` | `POST /api/v1/namecards` `{"last_name": "田中"}` | 201; 名刺作成 |
| 2 | `test_create_namecard_full` | `auth_headers`, `sample_relationship_tree`, `sample_tags` | `POST /api/v1/namecards` 全フィールド | 201; 全フィールド含む |
| 3 | `test_create_namecard_with_contact_methods` | `auth_headers` | `POST` + `contact_methods` 配列 | 201; `contact_methods` が返る |
| 4 | `test_create_namecard_with_multiple_relationships` | `auth_headers`, `sample_relationship_tree` | `POST` + `relationship_ids: [id1, id2]` | 201; `relationships` 配列に 2 件 |
| 5 | `test_create_namecard_with_multiple_tags` | `auth_headers`, `sample_tags` | `POST` + `tag_ids: [id1, id2, id3]` | 201; `tags` 配列に 3 件 |
| 6 | `test_list_namecards` | `auth_headers`, `sample_namecard` | `GET /api/v1/namecards` | 200; `items` 配列, `total`, `page`, `per_page`, `total_pages` |
| 7 | `test_list_namecards_pagination` | `auth_headers`, 名刺 25 件作成 | `GET /api/v1/namecards?page=2&per_page=10` | 200; `page: 2`, `per_page: 10`, `items` 10 件 |
| 8 | `test_list_namecards_default_sort` | `auth_headers`, 名刺 3 件 | `GET /api/v1/namecards` | 200; `updated_at` DESC 順 |
| 9 | `test_list_namecards_sort_by_kana` | `auth_headers`, 名刺 3 件 | `GET /api/v1/namecards?sort_by=last_name_kana&order=asc` | 200; 五十音順 |
| 10 | `test_list_namecards_filter_by_tag` | `auth_headers`, `sample_namecard`, `sample_tags` | `GET /api/v1/namecards?tag_id={id}` | 200; 該当タグ付き名刺のみ |
| 11 | `test_list_namecards_filter_by_relationship` | `auth_headers`, `sample_namecard`, `sample_relationship_tree` | `GET /api/v1/namecards?relationship_id={id}` | 200; 該当関係付き名刺のみ |
| 12 | `test_get_namecard_detail` | `auth_headers`, `sample_namecard` | `GET /api/v1/namecards/{id}` | 200; `contact_methods`, `relationships`, `tags` 含む |
| 13 | `test_get_namecard_includes_relationship_full_path` | `auth_headers`, `sample_namecard` | `GET /api/v1/namecards/{id}` | 200; `relationships[0].full_path` = `"建築士会/桑名支部/青年会長"` |
| 14 | `test_update_namecard_partial` | `auth_headers`, `sample_namecard` | `PATCH /api/v1/namecards/{id}` `{"first_name": "次郎"}` | 200; `first_name: "次郎"`, 他フィールド不変 |
| 15 | `test_update_namecard_contact_methods_replace` | `auth_headers`, `sample_namecard` | `PATCH` + `contact_methods: [{"type": "tel", "value": "03-1234-5678", "is_primary": true}]` | 200; `contact_methods` が 1 件に置換（NC-7: 完全置換） |
| 16 | `test_update_namecard_without_contact_methods` | `auth_headers`, `sample_namecard` | `PATCH` + `{"notes": "更新"}` （contact_methods 未送信） | 200; 既存 `contact_methods` 維持 |
| 17 | `test_delete_namecard` | `auth_headers`, `sample_namecard` | `DELETE /api/v1/namecards/{id}` | 204; 再取得で 404 |
| 18 | `test_delete_namecard_preserves_relationships_and_tags` | `auth_headers`, `sample_namecard` | `DELETE` 後に `GET /api/v1/relationships`, `GET /api/v1/tags` | 204; Relationship・Tag は残存 |

### 認証・認可エラー（9 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 19 | `test_create_namecard_unauthenticated` | なし | `POST /api/v1/namecards`（ヘッダーなし） | 401 |
| 20 | `test_list_namecards_unauthenticated` | なし | `GET /api/v1/namecards`（ヘッダーなし） | 401 |
| 21 | `test_get_namecard_unauthenticated` | `sample_namecard` | `GET /api/v1/namecards/{id}`（ヘッダーなし） | 401 |
| 22 | `test_update_namecard_unauthenticated` | `sample_namecard` | `PATCH /api/v1/namecards/{id}`（ヘッダーなし） | 401 |
| 23 | `test_delete_namecard_unauthenticated` | `sample_namecard` | `DELETE /api/v1/namecards/{id}`（ヘッダーなし） | 401 |
| 24 | `test_get_other_users_namecard` | `sample_namecard`, `other_auth_headers` | `GET /api/v1/namecards/{id}` + `other_auth_headers` | 404（リソース存在を隠蔽） |
| 25 | `test_update_other_users_namecard` | `sample_namecard`, `other_auth_headers` | `PATCH /api/v1/namecards/{id}` + `other_auth_headers` | 404 |
| 26 | `test_delete_other_users_namecard` | `sample_namecard`, `other_auth_headers` | `DELETE /api/v1/namecards/{id}` + `other_auth_headers` | 404 |
| 27 | `test_list_namecards_shows_only_own` | `sample_namecard`, `other_auth_headers` | `GET /api/v1/namecards` + `other_auth_headers` | 200; `items` 空配列, `total: 0` |

### バリデーションエラー（5 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 28 | `test_create_namecard_empty_body` | `auth_headers` | `POST /api/v1/namecards` `{}` | 422 |
| 29 | `test_create_namecard_invalid_contact_type` | `auth_headers` | `POST` + `contact_methods: [{"type": "invalid", "value": "..."}]` | 422; `type` が enum 外 |
| 30 | `test_create_namecard_contact_missing_value` | `auth_headers` | `POST` + `contact_methods: [{"type": "email"}]` | 422; `value` 必須 |
| 31 | `test_update_namecard_invalid_field_type` | `auth_headers`, `sample_namecard` | `PATCH` + `{"first_name": 123}` | 422 |
| 32 | `test_create_namecard_all_17_contact_types` | `auth_headers` | `POST` + 17 種全ての `type` | 201; 全 type が受け入れられる |

### ビジネスロジックエラー（4 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 33 | `test_create_namecard_invalid_relationship_id` | `auth_headers` | `POST` + `relationship_ids: [999]` | 400; `{"detail": "Invalid relationship_id: 999"}` |
| 34 | `test_create_namecard_invalid_tag_id` | `auth_headers` | `POST` + `tag_ids: [999]` | 400; `{"detail": "Invalid tag_id: 999"}` |
| 35 | `test_create_namecard_other_users_relationship` | `auth_headers`, 別ユーザーの Relationship | `POST` + 別ユーザーの `relationship_ids` | 400 |
| 36 | `test_create_namecard_other_users_tag` | `auth_headers`, 別ユーザーの Tag | `POST` + 別ユーザーの `tag_ids` | 400 |

### エッジケース（9 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 37 | `test_list_namecards_empty` | `auth_headers` | `GET /api/v1/namecards` | 200; `items: []`, `total: 0` |
| 38 | `test_list_namecards_per_page_exceeds_max` | `auth_headers` | `GET /api/v1/namecards?per_page=200` | 200; `per_page` は 100 に丸められる |
| 39 | `test_list_namecards_page_beyond_total` | `auth_headers`, 名刺 3 件 | `GET /api/v1/namecards?page=100` | 200; `items: []` |
| 40 | `test_get_nonexistent_namecard` | `auth_headers` | `GET /api/v1/namecards/99999` | 404; `{"detail": "Namecard not found"}` |
| 41 | `test_delete_nonexistent_namecard` | `auth_headers` | `DELETE /api/v1/namecards/99999` | 404 |
| 42 | `test_create_namecard_empty_contact_methods` | `auth_headers` | `POST` + `contact_methods: []` | 201; `contact_methods` 空配列 |
| 43 | `test_create_namecard_empty_relationship_ids` | `auth_headers` | `POST` + `relationship_ids: []` | 201; `relationships` 空配列 |
| 44 | `test_create_namecard_empty_tag_ids` | `auth_headers` | `POST` + `tag_ids: []` | 201; `tags` 空配列 |
| 45 | `test_list_namecards_invalid_sort_by` | `auth_headers` | `GET /api/v1/namecards?sort_by=invalid_field` | 422（NC-16: 無効な sort_by） |

---

## test_relationships.py（29 ケース）

### 正常系（10 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_create_root_relationship` | `auth_headers` | `POST /api/v1/relationships` `{"name": "建築士会", "parent_id": null}` | 201; `parent_id: null`, `full_path: "建築士会"` |
| 2 | `test_create_child_relationship` | `auth_headers`, ルートノード | `POST` `{"name": "桑名支部", "parent_id": {root_id}}` | 201; `full_path: "建築士会/桑名支部"` |
| 3 | `test_create_grandchild_relationship` | `auth_headers`, 2 階層 | `POST` `{"name": "青年会長", "parent_id": {child_id}}` | 201; `full_path: "建築士会/桑名支部/青年会長"` |
| 4 | `test_list_relationships` | `auth_headers`, `sample_relationship_tree` | `GET /api/v1/relationships` | 200; ルートノード一覧（children 含まず） |
| 5 | `test_list_relationships_no_pagination` | `auth_headers`, `sample_relationship_tree` | `GET /api/v1/relationships` | 200; 配列形式（ページネーションなし, NC-5） |
| 6 | `test_get_relationship_tree` | `auth_headers`, `sample_relationship_tree` | `GET /api/v1/relationships/tree` | 200; ネスト構造（`children` 配列含む） |
| 7 | `test_tree_includes_full_path` | `auth_headers`, `sample_relationship_tree` | `GET /api/v1/relationships/tree` | 200; 各ノードに `full_path` |
| 8 | `test_update_relationship_name` | `auth_headers`, `sample_relationship_tree` | `PATCH /api/v1/relationships/{id}` `{"name": "新名称"}` | 200; `name: "新名称"` |
| 9 | `test_update_relationship_parent` | `auth_headers`, 複数ルート | `PATCH` `{"parent_id": {other_root_id}}` | 200; `full_path` 更新 |
| 10 | `test_delete_leaf_relationship` | `auth_headers`, `sample_relationship_tree` | `DELETE /api/v1/relationships/{leaf_id}` | 204 |

### 認証・認可エラー（8 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 11 | `test_create_relationship_unauthenticated` | なし | `POST /api/v1/relationships`（ヘッダーなし） | 401 |
| 12 | `test_list_relationships_unauthenticated` | なし | `GET /api/v1/relationships`（ヘッダーなし） | 401 |
| 13 | `test_get_tree_unauthenticated` | なし | `GET /api/v1/relationships/tree`（ヘッダーなし） | 401 |
| 14 | `test_update_relationship_unauthenticated` | `sample_relationship_tree` | `PATCH`（ヘッダーなし） | 401 |
| 15 | `test_delete_relationship_unauthenticated` | `sample_relationship_tree` | `DELETE`（ヘッダーなし） | 401 |
| 16 | `test_update_other_users_relationship` | `sample_relationship_tree`, `other_auth_headers` | `PATCH` + `other_auth_headers` | 404 |
| 17 | `test_delete_other_users_relationship` | `sample_relationship_tree`, `other_auth_headers` | `DELETE` + `other_auth_headers` | 404 |
| 18 | `test_list_relationships_shows_only_own` | `sample_relationship_tree`, `other_auth_headers` | `GET /api/v1/relationships` + `other_auth_headers` | 200; 空配列 |

### バリデーションエラー（2 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 19 | `test_create_relationship_missing_name` | `auth_headers` | `POST` `{"parent_id": null}` | 422; `name` 必須 |
| 20 | `test_create_relationship_empty_name` | `auth_headers` | `POST` `{"name": "", "parent_id": null}` | 422 |

### ビジネスロジックエラー（6 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 21 | `test_delete_relationship_with_children` | `auth_headers`, `sample_relationship_tree` | `DELETE /api/v1/relationships/{parent_id}` | 400; `{"detail": "Cannot delete node with children"}` |
| 22 | `test_delete_relationship_mid_level` | `auth_headers`, 3 階層 | `DELETE` 中間ノード | 400; 子孫あり |
| 23 | `test_create_relationship_circular_reference` | `auth_headers`, ツリー | `PATCH` ルートの `parent_id` をリーフに変更 | 400; `{"detail": "Circular reference detected"}` |
| 24 | `test_update_relationship_circular_self` | `auth_headers`, ノード | `PATCH` `{"parent_id": {self_id}}` | 400; 自分自身を親に設定 |
| 25 | `test_create_relationship_invalid_parent_id` | `auth_headers` | `POST` `{"name": "X", "parent_id": 99999}` | 400 |
| 26 | `test_create_relationship_other_users_parent` | `auth_headers`, 別ユーザーの Relationship | `POST` + 別ユーザーの `parent_id` | 400 |

### エッジケース（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 27 | `test_get_tree_empty` | `auth_headers` | `GET /api/v1/relationships/tree` | 200; 空配列 |
| 28 | `test_delete_nonexistent_relationship` | `auth_headers` | `DELETE /api/v1/relationships/99999` | 404; `{"detail": "Relationship not found"}` |
| 29 | `test_tree_shows_only_own_relationships` | `sample_relationship_tree`, `other_auth_headers` | `GET /api/v1/relationships/tree` + `other_auth_headers` | 200; 空配列 |

---

## test_tags.py（20 ケース）

### 正常系（6 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_create_tag` | `auth_headers` | `POST /api/v1/tags` `{"name": "取引先"}` | 201; `{"id": ..., "name": "取引先"}` |
| 2 | `test_list_tags` | `auth_headers`, `sample_tags` | `GET /api/v1/tags` | 200; 配列, 3 件 |
| 3 | `test_list_tags_no_pagination` | `auth_headers`, `sample_tags` | `GET /api/v1/tags` | 200; 配列形式（ページネーションなし） |
| 4 | `test_update_tag` | `auth_headers`, `sample_tags` | `PATCH /api/v1/tags/{id}` `{"name": "新しい名前"}` | 200; `name: "新しい名前"` |
| 5 | `test_delete_tag` | `auth_headers`, `sample_tags` | `DELETE /api/v1/tags/{id}` | 204 |
| 6 | `test_delete_tag_preserves_namecards` | `auth_headers`, `sample_namecard` | `DELETE /api/v1/tags/{tag_id}` 後に名刺取得 | 204; 名刺は残存、`tags` から除外 |

### 認証・認可エラー（7 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 7 | `test_create_tag_unauthenticated` | なし | `POST /api/v1/tags`（ヘッダーなし） | 401 |
| 8 | `test_list_tags_unauthenticated` | なし | `GET /api/v1/tags`（ヘッダーなし） | 401 |
| 9 | `test_update_tag_unauthenticated` | `sample_tags` | `PATCH`（ヘッダーなし） | 401 |
| 10 | `test_delete_tag_unauthenticated` | `sample_tags` | `DELETE`（ヘッダーなし） | 401 |
| 11 | `test_update_other_users_tag` | `sample_tags`, `other_auth_headers` | `PATCH` + `other_auth_headers` | 404 |
| 12 | `test_delete_other_users_tag` | `sample_tags`, `other_auth_headers` | `DELETE` + `other_auth_headers` | 404 |
| 13 | `test_list_tags_shows_only_own` | `sample_tags`, `other_auth_headers` | `GET /api/v1/tags` + `other_auth_headers` | 200; 空配列 |

### バリデーションエラー（2 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 14 | `test_create_tag_missing_name` | `auth_headers` | `POST /api/v1/tags` `{}` | 422; `name` 必須 |
| 15 | `test_create_tag_empty_name` | `auth_headers` | `POST /api/v1/tags` `{"name": ""}` | 422 |

### ビジネスロジックエラー（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 16 | `test_create_tag_duplicate_name` | `auth_headers`, タグ「取引先」 | `POST` `{"name": "取引先"}` | 409; `{"detail": "Tag already exists"}` |
| 17 | `test_update_tag_duplicate_name` | `auth_headers`, タグ 2 件 | `PATCH` 2 番目を 1 番目と同名に | 409; `{"detail": "Tag already exists"}` |
| 18 | `test_create_tag_same_name_different_user` | `auth_headers` + `other_auth_headers` | 両ユーザーで同名タグ作成 | 201; ユーザーごとにユニーク |

### エッジケース（2 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 19 | `test_list_tags_empty` | `auth_headers` | `GET /api/v1/tags` | 200; 空配列 |
| 20 | `test_delete_nonexistent_tag` | `auth_headers` | `DELETE /api/v1/tags/99999` | 404; `{"detail": "Tag not found"}` |

---

## test_search.py（20 ケース）

### 正常系（15 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_search_by_last_name` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=田中` | 200; 1 件ヒット |
| 2 | `test_search_by_first_name` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=太郎` | 200; 1 件ヒット |
| 3 | `test_search_by_kana` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=たなか` | 200; 1 件ヒット |
| 4 | `test_search_by_relationship_full_path` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=建築士会` | 200; 1 件ヒット |
| 5 | `test_search_by_contact_method_value` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=tanaka@example.com` | 200; 1 件ヒット |
| 6 | `test_search_by_notes` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=重要な取引先` | 200; 1 件ヒット |
| 7 | `test_search_by_met_notes` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=展示会` | 200; 1 件ヒット |
| 8 | `test_search_partial_match` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=田` | 200; 部分一致 |
| 9 | `test_search_filter_by_tag_ids` | `auth_headers`, `sample_namecard`, `sample_tags` | `GET /api/v1/search?tag_ids={tag_id}` | 200; タグフィルタ |
| 10 | `test_search_filter_by_relationship_ids` | `auth_headers`, `sample_namecard`, `sample_relationship_tree` | `GET /api/v1/search?relationship_ids={rel_id}` | 200; Relationship フィルタ |
| 11 | `test_search_filter_by_multiple_tag_ids` | `auth_headers`, 名刺複数, タグ複数 | `GET /api/v1/search?tag_ids=1,2` | 200; カンマ区切り複数 ID |
| 12 | `test_search_combined_text_and_filter` | `auth_headers`, `sample_namecard`, `sample_tags` | `GET /api/v1/search?q=田中&tag_ids={id}` | 200; テキスト + フィルタ |
| 13 | `test_search_filter_by_created_at_range` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?created_at_start=...&created_at_end=...` | 200; 日付範囲フィルタ |
| 14 | `test_search_filter_by_updated_at_range` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?updated_at_start=...&updated_at_end=...` | 200; 更新日時範囲 |
| 15 | `test_search_with_pagination` | `auth_headers`, 名刺 25 件 | `GET /api/v1/search?q=...&page=2&per_page=10` | 200; ページネーション |

### 認証・認可エラー（2 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 16 | `test_search_unauthenticated` | なし | `GET /api/v1/search?q=test`（ヘッダーなし） | 401 |
| 17 | `test_search_shows_only_own_namecards` | `sample_namecard`, `other_auth_headers` | `GET /api/v1/search?q=田中` + `other_auth_headers` | 200; 0 件（他ユーザーの名刺は非表示） |

### エッジケース（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 18 | `test_search_no_results` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?q=存在しないキーワード` | 200; `items: []`, `total: 0` |
| 19 | `test_search_invalid_tag_ids_format` | `auth_headers` | `GET /api/v1/search?tag_ids=1,abc,3` | 422（NC-10: 数値変換不可） |
| 20 | `test_search_empty_tag_ids` | `auth_headers`, `sample_namecard` | `GET /api/v1/search?tag_ids=` | 200; フィルタ無効（全件対象, NC-10） |

---

## test_images.py（22 ケース）

### 正常系（6 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_upload_image` | `auth_headers` | `POST /api/v1/images/upload` + `multipart/form-data` (JPEG) | 202; `upload_id`, `message` |
| 2 | `test_upload_image_png` | `auth_headers` | `POST /api/v1/images/upload` + PNG ファイル | 202 |
| 3 | `test_process_image` | `auth_headers`, アップロード済み | `POST /api/v1/images/process` + `upload_id`, `corners` | 200; `ocr_result`, `image_path`, `thumbnail_path` |
| 4 | `test_process_image_ocr_result_format` | `auth_headers`, アップロード済み | `POST /api/v1/images/process` | 200; `ocr_result` が `NameCardCreate` 形式（NC-1: contact_methods 配列） |
| 5 | `test_get_image` | `auth_headers`, 名刺画像あり | `GET /api/v1/images/{namecard_id}` | 200; FileResponse (WebP) |
| 6 | `test_get_thumbnail` | `auth_headers`, 名刺画像あり | `GET /api/v1/images/{namecard_id}/thumbnail` | 200; FileResponse (WebP, サムネイル) |

### 認証・認可エラー（6 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 7 | `test_upload_unauthenticated` | なし | `POST /api/v1/images/upload`（ヘッダーなし） | 401 |
| 8 | `test_process_unauthenticated` | なし | `POST /api/v1/images/process`（ヘッダーなし） | 401 |
| 9 | `test_get_image_unauthenticated` | 名刺画像あり | `GET /api/v1/images/{id}`（ヘッダーなし） | 401 |
| 10 | `test_get_thumbnail_unauthenticated` | 名刺画像あり | `GET /api/v1/images/{id}/thumbnail`（ヘッダーなし） | 401 |
| 11 | `test_get_other_users_image` | 名刺画像あり, `other_auth_headers` | `GET /api/v1/images/{id}` + `other_auth_headers` | 404 |
| 12 | `test_process_image_other_users_upload_id` | ユーザー A アップロード済み, `other_auth_headers` | `POST /api/v1/images/process` + ユーザー A の `upload_id` + `other_auth_headers` | 404（NC-9: クロスユーザーセキュリティ） |

### バリデーションエラー（4 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 13 | `test_upload_no_file` | `auth_headers` | `POST /api/v1/images/upload`（ファイルなし） | 422 |
| 14 | `test_process_missing_upload_id` | `auth_headers` | `POST /api/v1/images/process` `{"corners": [...]}` | 422; `upload_id` 必須 |
| 15 | `test_process_missing_corners` | `auth_headers` | `POST /api/v1/images/process` `{"upload_id": "..."}` | 422; `corners` 必須 |
| 16 | `test_process_invalid_corners_count` | `auth_headers`, アップロード済み | `POST` + `corners: [{"x":0,"y":0}, {"x":1,"y":1}]`（2 点のみ） | 422; 4 点必須 |

### ビジネスロジックエラー（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 17 | `test_upload_file_too_large` | `auth_headers` | `POST /api/v1/images/upload` + 21MB ファイル | 413; `{"detail": "File too large. Maximum size is 20MB."}` |
| 18 | `test_process_invalid_upload_id` | `auth_headers` | `POST /api/v1/images/process` + 存在しない `upload_id` | 404; `{"detail": "Upload not found"}` |
| 19 | `test_process_ocr_timeout` | `auth_headers`, アップロード済み（OCR タイムアウト模擬） | `POST /api/v1/images/process` | 408; `{"detail": "OCR timeout. Please try again."}` |

### エッジケース（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 20 | `test_get_image_no_image` | `auth_headers`, 画像なし名刺 | `GET /api/v1/images/{namecard_id}` | 404; `{"detail": "Image not found"}` |
| 21 | `test_get_thumbnail_no_image` | `auth_headers`, 画像なし名刺 | `GET /api/v1/images/{namecard_id}/thumbnail` | 404; `{"detail": "Image not found"}` |
| 22 | `test_get_image_nonexistent_namecard` | `auth_headers` | `GET /api/v1/images/99999` | 404 |

---

## test_export_import.py（16 ケース）

### 正常系（8 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_export_json` | `auth_headers`, `sample_namecard` | `GET /api/v1/export/json` | 200; JSON（`exported_at`, `version`, `relationships`, `tags`, `namecards`） |
| 2 | `test_export_json_contains_all_data` | `auth_headers`, 名刺 3 件, タグ, Relationship | `GET /api/v1/export/json` | 200; 全データ含む |
| 3 | `test_export_json_includes_contact_methods` | `auth_headers`, `sample_namecard` | `GET /api/v1/export/json` | 200; `namecards[0].contact_methods` 含む |
| 4 | `test_export_json_relationship_order` | `auth_headers`, `sample_relationship_tree` | `GET /api/v1/export/json` | 200; `parent_id` 昇順（null 先頭, NC-8） |
| 5 | `test_import_json` | `auth_headers` | `POST /api/v1/import/json` + 有効な JSON | 200; `imported` カウント |
| 6 | `test_import_json_counts` | `auth_headers` | `POST /api/v1/import/json` + 3 名刺, 2 タグ, 5 Relationship | 200; `imported.namecards: 3`, `imported.tags: 2`, `imported.relationships: 5` |
| 7 | `test_export_import_roundtrip` | `auth_headers`, `sample_namecard` | エクスポート → 全データ削除 → インポート → 検証 | 200; データ完全復元 |
| 8 | `test_import_json_skip_existing` | `auth_headers`, 既存データあり | `POST /api/v1/import/json` + 既存と重複する ID/名前 | 200; `skipped` カウント > 0 |

### 認証・認可エラー（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 9 | `test_export_unauthenticated` | なし | `GET /api/v1/export/json`（ヘッダーなし） | 401 |
| 10 | `test_import_unauthenticated` | なし | `POST /api/v1/import/json`（ヘッダーなし） | 401 |
| 11 | `test_export_shows_only_own_data` | `sample_namecard`, `other_auth_headers` | `GET /api/v1/export/json` + `other_auth_headers` | 200; `namecards: []`（他ユーザーのデータなし） |

### バリデーションエラー（2 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 12 | `test_import_invalid_json` | `auth_headers` | `POST /api/v1/import/json` + 不正 JSON 文字列 | 400; `{"detail": "Invalid JSON format"}` |
| 13 | `test_import_missing_required_fields` | `auth_headers` | `POST /api/v1/import/json` + `{"version": "1.0"}`（namecards なし） | 400 or 422 |

### ビジネスロジックエラー（3 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 14 | `test_import_skip_existing_relationship_by_id` | `auth_headers`, 既存 Relationship | 同 ID の Relationship をインポート | 200; `skipped.relationships: 1` |
| 15 | `test_import_skip_existing_tag_by_name` | `auth_headers`, 既存タグ「取引先」 | 同名タグをインポート | 200; `skipped.tags: 1` |
| 16 | `test_import_skip_existing_namecard_by_id` | `auth_headers`, 既存名刺 | 同 ID の名刺をインポート | 200; `skipped.namecards: 1` |

---

## test_health.py（2 ケース）

### 正常系（1 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 1 | `test_health_check` | なし | `GET /health`（NC-13: ルートパス） | 200; `{"status": "ok"}` or 類似 |

### エッジケース（1 ケース）

| # | テスト名 | セットアップ | リクエスト | 期待結果 |
|---|---------|------------|----------|---------|
| 2 | `test_health_no_auth_required` | なし | `GET /health`（認証ヘッダーなし） | 200; 認証不要 |

---

## サマリー

### テストケース数

| ファイル | 正常系 | 認証・認可 | バリデーション | ビジネスロジック | エッジケース | 合計 |
|---------|--------|-----------|---------------|----------------|------------|------|
| test_auth.py | 3 | — | 3 | — | 5 | **11** |
| test_namecards.py | 18 | 9 | 5 | 4 | 9 | **45** |
| test_relationships.py | 10 | 8 | 2 | 6 | 3 | **29** |
| test_tags.py | 6 | 7 | 2 | 3 | 2 | **20** |
| test_search.py | 15 | 2 | — | — | 3 | **20** |
| test_images.py | 6 | 6 | 4 | 3 | 3 | **22** |
| test_export_import.py | 8 | 3 | 2 | 3 | — | **16** |
| test_health.py | 1 | — | — | — | 1 | **2** |
| **合計** | **67** | **35** | **18** | **19** | **26** | **165** |

### 重要な仕様参照（NC 指摘）

| NC # | 内容 | 影響テスト |
|------|------|-----------|
| NC-1 | OCR レスポンス = NameCardCreate 形式 | `test_process_image_ocr_result_format` |
| NC-2 | ContactMethod.label 廃止 | 全名刺テスト（label フィールドなし） |
| NC-3 | pytest ファイル命名 `test_*.py` | pyproject.toml 更新 |
| NC-5 | Relationship ページネーションなし | `test_list_relationships_no_pagination` |
| NC-7 | contact_methods 完全置換 | `test_update_namecard_contact_methods_replace` |
| NC-8 | エクスポート parent_id 昇順 | `test_export_json_relationship_order` |
| NC-9 | 他ユーザー upload_id セキュリティ | `test_process_image_other_users_upload_id` |
| NC-10 | カンマ区切り ID パース | `test_search_invalid_tag_ids_format`, `test_search_empty_tag_ids` |
| NC-13 | Health パス `/health` | `test_health_check` |
| NC-15 | 422 FastAPI デフォルト形式 | 全バリデーションエラーテスト |
| NC-16 | sort_by 有効値制限 | `test_list_namecards_invalid_sort_by` |
| NC-19 | sort_by 無効値テスト追加 | `test_list_namecards_invalid_sort_by`（NC-16 対応） |
