"""JSON エクスポート/インポートエンドポイントのテスト。

GET  /api/v1/export/json  – 全データを JSON エクスポート
POST /api/v1/import/json  – JSON データをインポート
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import NameCard, Relationship, Tag

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ヘルパー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _build_import_payload(
    *,
    relationships: list[dict] | None = None,
    tags: list[dict] | None = None,
    namecards: list[dict] | None = None,
) -> dict:
    """インポート用の JSON ペイロードを組み立てる。"""
    return {
        "version": "1.0",
        "relationships": relationships or [],
        "tags": tags or [],
        "namecards": namecards or [],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TestExportJsonSuccess:
    """全データを JSON エクスポートできる。"""

    def test_export_json_success(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_namecard: dict,
    ) -> None:
        """エクスポートが 200 を返し、必須キーを含む。"""
        resp = client.get("/api/v1/export/json", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert "exported_at" in data
        assert data["version"] == "1.0"
        assert "relationships" in data
        assert "tags" in data
        assert "namecards" in data
        assert len(data["namecards"]) >= 1


class TestExportJsonIncludesRelationships:
    """エクスポートに全 Relationship が含まれる。"""

    def test_export_json_includes_relationships(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_relationship_tree: list[dict],
        sample_namecard: dict,
    ) -> None:
        """Relationship ツリー（3 件）がエクスポートに含まれる。"""
        resp = client.get("/api/v1/export/json", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        exported_rel_ids = {r["id"] for r in data["relationships"]}
        for rel in sample_relationship_tree:
            assert rel["id"] in exported_rel_ids


class TestExportJsonIncludesContactMethods:
    """エクスポートの namecards に contact_methods が含まれる。"""

    def test_export_json_includes_contact_methods(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_namecard: dict,
    ) -> None:
        """名刺の contact_methods がエクスポートに含まれる。"""
        resp = client.get("/api/v1/export/json", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        nc = data["namecards"][0]
        assert "contact_methods" in nc
        assert len(nc["contact_methods"]) >= 1
        cm = nc["contact_methods"][0]
        assert "type" in cm
        assert "value" in cm


class TestExportJsonEmptyData:
    """データ 0 件でも正常にエクスポートできる。"""

    def test_export_json_empty_data(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """データ未作成でもエクスポートは 200 で空配列を返す。"""
        resp = client.get("/api/v1/export/json", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["relationships"] == []
        assert data["tags"] == []
        assert data["namecards"] == []


class TestExportJsonRelationshipOrder:
    """エクスポートの relationships が parent_id 昇順（null 先頭）で並ぶ。"""

    def test_export_json_relationship_order(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_relationship_tree: list[dict],
    ) -> None:
        """NC-8: relationships は parent_id 昇順（null 先頭）でエクスポートされる。

        インポート時の依存解決のため、親が子より先に来る必要がある。
        """
        resp = client.get("/api/v1/export/json", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        rels = data["relationships"]
        assert len(rels) >= 3

        # parent_id が昇順（None=null は先頭）で並んでいることを検証
        parent_ids = [r["parent_id"] for r in rels]
        # None を -inf 相当に変換してソート済みか確認
        sort_key = [pid if pid is not None else float("-inf") for pid in parent_ids]
        assert sort_key == sorted(sort_key), (
            f"relationships must be sorted by parent_id asc (null first): {parent_ids}"
        )


class TestImportJsonSuccess:
    """JSON データをインポートできる。"""

    def test_import_json_success(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """有効な JSON をインポートし 200 と imported カウントを返す。"""
        payload = _build_import_payload(
            relationships=[
                {"id": 100, "name": "テスト組織", "parent_id": None},
            ],
            tags=[
                {"id": 100, "name": "インポートタグ"},
            ],
            namecards=[
                {
                    "first_name": "花子",
                    "last_name": "山田",
                    "first_name_kana": "はなこ",
                    "last_name_kana": "やまだ",
                    "relationship_ids": [100],
                    "tag_ids": [100],
                    "contact_methods": [
                        {
                            "type": "email",
                            "value": "yamada@example.com",
                            "is_primary": True,
                        },
                    ],
                },
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert "imported" in data
        assert data["imported"]["relationships"] == 1
        assert data["imported"]["tags"] == 1
        assert data["imported"]["namecards"] == 1


class TestImportJsonCreatesRelationships:
    """Relationship が正しくインポートされる。"""

    def test_import_json_creates_relationships(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        user_and_token: tuple[dict, str],
    ) -> None:
        """インポート後に Relationship が DB に存在する。"""
        user_dict, _ = user_and_token
        payload = _build_import_payload(
            relationships=[
                {"id": 200, "name": "親組織", "parent_id": None},
                {"id": 201, "name": "子組織", "parent_id": 200},
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json()["imported"]["relationships"] == 2

        # DB に Relationship が作成されていることを確認
        rels = (
            db_session.query(Relationship)
            .filter(Relationship.user_id == user_dict["id"])
            .all()
        )
        rel_names = {r.name for r in rels}
        assert "親組織" in rel_names
        assert "子組織" in rel_names


class TestImportJsonCreatesTags:
    """Tag が正しくインポートされる。"""

    def test_import_json_creates_tags(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        user_and_token: tuple[dict, str],
    ) -> None:
        """インポート後に Tag が DB に存在する。"""
        user_dict, _ = user_and_token
        payload = _build_import_payload(
            tags=[
                {"id": 300, "name": "新タグA"},
                {"id": 301, "name": "新タグB"},
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json()["imported"]["tags"] == 2

        tags = db_session.query(Tag).filter(Tag.user_id == user_dict["id"]).all()
        tag_names = {t.name for t in tags}
        assert "新タグA" in tag_names
        assert "新タグB" in tag_names


class TestImportJsonCreatesNamecardsWithAssociations:
    """名刺が関連付きでインポートされる。"""

    def test_import_json_creates_namecards_with_associations(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        user_and_token: tuple[dict, str],
    ) -> None:
        """インポートされた名刺に Relationship, Tag, ContactMethod が紐づく。"""
        user_dict, _ = user_and_token
        payload = _build_import_payload(
            relationships=[
                {"id": 400, "name": "関連組織", "parent_id": None},
            ],
            tags=[
                {"id": 400, "name": "関連タグ"},
            ],
            namecards=[
                {
                    "first_name": "次郎",
                    "last_name": "佐藤",
                    "relationship_ids": [400],
                    "tag_ids": [400],
                    "contact_methods": [
                        {
                            "type": "mobile",
                            "value": "090-9999-0000",
                            "is_primary": True,
                        },
                    ],
                },
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200

        nc = (
            db_session.query(NameCard)
            .filter(
                NameCard.user_id == user_dict["id"],
                NameCard.last_name == "佐藤",
            )
            .first()
        )
        assert nc is not None
        assert len(nc.relationships) >= 1
        assert len(nc.tags) >= 1
        assert len(nc.contact_methods) >= 1


class TestExportImportRoundtrip:
    """エクスポート → インポートで名刺データが保持される。"""

    def test_export_import_roundtrip(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_namecard: dict,
        sample_relationship_tree: list[dict],
        sample_tags: list[dict],
    ) -> None:
        """エクスポートした JSON を再インポートし、データが復元される。"""
        # 1. エクスポート
        export_resp = client.get("/api/v1/export/json", headers=auth_headers)
        assert export_resp.status_code == 200
        exported = export_resp.json()

        # エクスポートされたデータの件数を記録
        assert len(exported["namecards"]) >= 1
        assert len(exported["relationships"]) >= 1
        assert len(exported["tags"]) >= 1

        # 2. 同じデータをインポート（既存はスキップされる）
        import_resp = client.post(
            "/api/v1/import/json", json=exported, headers=auth_headers
        )
        assert import_resp.status_code == 200

        # 3. 再エクスポートして確認
        re_export_resp = client.get("/api/v1/export/json", headers=auth_headers)
        assert re_export_resp.status_code == 200
        re_exported = re_export_resp.json()

        # データ件数が保持されている
        assert len(re_exported["namecards"]) == len(exported["namecards"])
        assert len(re_exported["relationships"]) == len(exported["relationships"])
        assert len(re_exported["tags"]) == len(exported["tags"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TestExportJsonUnauthenticated:
    """未認証でエクスポートすると 401。"""

    def test_export_json_unauthenticated(self, client: TestClient) -> None:
        """認証ヘッダーなしでエクスポートすると 401。"""
        resp = client.get("/api/v1/export/json")

        assert resp.status_code == 401


class TestImportJsonUnauthenticated:
    """未認証でインポートすると 401。"""

    def test_import_json_unauthenticated(self, client: TestClient) -> None:
        """認証ヘッダーなしでインポートすると 401。"""
        payload = _build_import_payload()

        resp = client.post("/api/v1/import/json", json=payload)

        assert resp.status_code == 401


class TestExportJsonScopedToUser:
    """他ユーザーのデータがエクスポートに含まれない。"""

    def test_export_json_scoped_to_user(
        self,
        client: TestClient,
        other_auth_headers: dict[str, str],
        sample_namecard: dict,
    ) -> None:
        """別ユーザーでエクスポートすると、元ユーザーのデータは含まれない。"""
        resp = client.get("/api/v1/export/json", headers=other_auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["namecards"] == []
        assert data["relationships"] == []
        assert data["tags"] == []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  バリデーションエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TestImportJsonInvalidFormat:
    """不正な JSON 形式で 400。"""

    def test_import_json_invalid_format(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """不正な JSON 文字列を送信すると 400。"""
        resp = client.post(
            "/api/v1/import/json",
            content="{ this is not valid json",
            headers={**auth_headers, "Content-Type": "application/json"},
        )

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid JSON format"


class TestImportJsonEmptyBody:
    """空ボディで 422。"""

    def test_import_json_empty_body(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
    ) -> None:
        """空のリクエストボディで 422。"""
        resp = client.post(
            "/api/v1/import/json",
            content="",
            headers={**auth_headers, "Content-Type": "application/json"},
        )

        assert resp.status_code in (400, 422)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ビジネスロジックエラー（競合処理）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TestImportJsonSkipExistingTag:
    """同名タグが既に存在する場合はスキップ。"""

    def test_import_json_skip_existing_tag(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_tags: list[dict],
    ) -> None:
        """既存タグと同名のタグをインポートするとスキップされる。"""
        existing_tag_name = sample_tags[0]["name"]  # "取引先"
        payload = _build_import_payload(
            tags=[
                {"id": 900, "name": existing_tag_name},
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["skipped"]["tags"] >= 1


class TestImportJsonSkipExistingNamecard:
    """同 ID の名刺が既に存在する場合はスキップ。"""

    def test_import_json_skip_existing_namecard(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_namecard: dict,
    ) -> None:
        """既存名刺と同じ ID でインポートするとスキップされる。"""
        payload = _build_import_payload(
            namecards=[
                {
                    "id": sample_namecard["id"],
                    "first_name": "重複",
                    "last_name": "テスト",
                    "contact_methods": [],
                },
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["skipped"]["namecards"] >= 1


class TestImportJsonSkipExistingRelationshipById:
    """同 ID の Relationship が既に存在する場合はスキップ。"""

    def test_import_skip_existing_relationship_by_id(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        sample_relationship_tree: list[dict],
    ) -> None:
        """既存 Relationship と同じ ID でインポートするとスキップされる。"""
        existing_rel = sample_relationship_tree[0]
        payload = _build_import_payload(
            relationships=[
                {
                    "id": existing_rel["id"],
                    "name": "重複組織",
                    "parent_id": None,
                },
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["skipped"]["relationships"] >= 1


class TestImportJsonNewIdWhenNoId:
    """ID 未指定のデータは新規作成。"""

    def test_import_json_new_id_when_no_id(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        user_and_token: tuple[dict, str],
    ) -> None:
        """ID なしの名刺をインポートすると新しい ID で作成される。"""
        user_dict, _ = user_and_token
        payload = _build_import_payload(
            namecards=[
                {
                    "first_name": "新規",
                    "last_name": "作成",
                    "contact_methods": [],
                },
            ],
        )

        resp = client.post("/api/v1/import/json", json=payload, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["imported"]["namecards"] == 1

        # DB に新規名刺が作成されていることを確認
        nc = (
            db_session.query(NameCard)
            .filter(
                NameCard.user_id == user_dict["id"],
                NameCard.last_name == "作成",
            )
            .first()
        )
        assert nc is not None
        assert nc.id is not None
