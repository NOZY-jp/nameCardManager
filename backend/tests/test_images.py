"""画像/OCR エンドポイントのテスト。

POST /api/v1/images/upload          – 画像アップロード
POST /api/v1/images/process         – 四隅指定 + OCR 処理
GET  /api/v1/images/{namecard_id}   – 名刺画像取得
GET  /api/v1/images/{namecard_id}/thumbnail – サムネイル取得
"""

from __future__ import annotations

import io
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.models import NameCard

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ヘルパー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _create_test_image(
    fmt: str = "JPEG",
    size: tuple[int, int] = (200, 100),
) -> io.BytesIO:
    """テスト用の画像ファイルをメモリ上に作成する。"""
    img = Image.new("RGB", size, color="red")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf


_EXT_MAP = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}


def _upload_image(
    client: TestClient,
    auth_headers: dict[str, str],
    fmt: str = "JPEG",
) -> dict:
    """画像をアップロードし、レスポンス JSON を返すヘルパー。"""
    buf = _create_test_image(fmt=fmt)
    ext = _EXT_MAP.get(fmt, ".jpg")
    content_type = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }.get(fmt, "image/jpeg")

    resp = client.post(
        "/api/v1/images/upload",
        files={"file": (f"test{ext}", buf, content_type)},
        headers=auth_headers,
    )
    return resp.json()


def _make_corners() -> list[dict[str, int]]:
    """4 隅座標のサンプルを返す。"""
    return [
        {"x": 10, "y": 20},
        {"x": 200, "y": 15},
        {"x": 205, "y": 120},
        {"x": 8, "y": 125},
    ]


def _create_namecard_with_image(
    db_session: Session,
    user_id: int,
    *,
    image_path: str | None = "/images/test.webp",
) -> NameCard:
    """画像パス付きの名刺を DB に直接作成する。"""
    namecard = NameCard(
        user_id=user_id,
        first_name="太郎",
        last_name="田中",
        image_path=image_path,
    )
    db_session.add(namecard)
    db_session.flush()
    return namecard


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  正常系
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_upload_image_success(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """JPEG 画像をアップロードできる。"""
    buf = _create_test_image(fmt="JPEG")
    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("test.jpg", buf, "image/jpeg")},
        headers=auth_headers,
    )

    assert resp.status_code == 202
    data = resp.json()
    assert "upload_id" in data
    assert "message" in data


def test_upload_image_png(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """PNG 画像をアップロードできる。"""
    buf = _create_test_image(fmt="PNG")
    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("test.png", buf, "image/png")},
        headers=auth_headers,
    )

    assert resp.status_code == 202
    data = resp.json()
    assert "upload_id" in data


def test_upload_image_webp(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """WebP 画像をアップロードできる。"""
    buf = _create_test_image(fmt="WEBP")
    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("test.webp", buf, "image/webp")},
        headers=auth_headers,
    )

    assert resp.status_code == 202
    data = resp.json()
    assert "upload_id" in data


def test_process_image_success(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """四隅座標を送信し、OCR 結果 + 画像パスを取得できる。"""
    # Setup: 画像アップロード
    upload_data = _upload_image(client, auth_headers)
    upload_id = upload_data["upload_id"]

    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": upload_id, "corners": _make_corners()},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "ocr_result" in data
    assert "image_path" in data
    assert "thumbnail_path" in data


def test_process_image_ocr_result_format(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """OCR 結果が NameCardCreate と同一構造（NC-1: contact_methods 配列）。"""
    # Setup: 画像アップロード
    upload_data = _upload_image(client, auth_headers)
    upload_id = upload_data["upload_id"]

    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": upload_id, "corners": _make_corners()},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    ocr_result = resp.json()["ocr_result"]

    # NameCardCreate と同一構造のフィールドが存在すること
    assert "first_name" in ocr_result
    assert "last_name" in ocr_result
    assert "contact_methods" in ocr_result
    assert isinstance(ocr_result["contact_methods"], list)

    # contact_methods の各要素が type, value, is_primary を持つ
    if ocr_result["contact_methods"]:
        cm = ocr_result["contact_methods"][0]
        assert "type" in cm
        assert "value" in cm
        assert "is_primary" in cm


def test_get_image_success(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """名刺画像を取得できる。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(
        f"/api/v1/images/{namecard.id}",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert "image" in resp.headers.get("content-type", "")


def test_get_thumbnail_success(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """サムネイルを取得できる。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(
        f"/api/v1/images/{namecard.id}/thumbnail",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert "image" in resp.headers.get("content-type", "")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  認証・認可エラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_upload_image_unauthenticated(client: TestClient) -> None:
    """未認証で画像アップロードすると 401。"""
    buf = _create_test_image()
    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("test.jpg", buf, "image/jpeg")},
    )

    assert resp.status_code == 401


def test_process_image_unauthenticated(client: TestClient) -> None:
    """未認証で画像処理すると 401。"""
    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": str(uuid4()), "corners": _make_corners()},
    )

    assert resp.status_code == 401


def test_get_image_unauthenticated(
    client: TestClient,
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """未認証で名刺画像を取得すると 401。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(f"/api/v1/images/{namecard.id}")

    assert resp.status_code == 401


def test_get_thumbnail_unauthenticated(
    client: TestClient,
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """未認証でサムネイルを取得すると 401。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(f"/api/v1/images/{namecard.id}/thumbnail")

    assert resp.status_code == 401


def test_get_image_other_users_namecard(
    client: TestClient,
    db_session: Session,
    user_and_token: tuple[dict, str],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの名刺画像を取得すると 404。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(
        f"/api/v1/images/{namecard.id}",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_get_thumbnail_other_users_namecard(
    client: TestClient,
    db_session: Session,
    user_and_token: tuple[dict, str],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーのサムネイルを取得すると 404。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(db_session, user_dict["id"])

    resp = client.get(
        f"/api/v1/images/{namecard.id}/thumbnail",
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


def test_process_image_other_users_upload_id(
    client: TestClient,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    """他ユーザーの upload_id で処理すると 404（NC-9: クロスユーザーセキュリティ）。"""
    # Setup: ユーザー A がアップロード
    upload_data = _upload_image(client, auth_headers)
    upload_id = upload_data["upload_id"]

    # Act: ユーザー B が処理を試行
    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": upload_id, "corners": _make_corners()},
        headers=other_auth_headers,
    )

    assert resp.status_code == 404


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  バリデーションエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_upload_image_no_file(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """ファイル未添付で 422。"""
    resp = client.post(
        "/api/v1/images/upload",
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_process_image_missing_upload_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """upload_id 未指定で 422。"""
    resp = client.post(
        "/api/v1/images/process",
        json={"corners": _make_corners()},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_process_image_missing_corners(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """corners 未指定で 422。"""
    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": str(uuid4())},
        headers=auth_headers,
    )

    assert resp.status_code == 422


def test_process_image_invalid_corners_count(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """corners が 4 つでない場合 422。"""
    # 2 点のみ指定
    resp = client.post(
        "/api/v1/images/process",
        json={
            "upload_id": str(uuid4()),
            "corners": [{"x": 0, "y": 0}, {"x": 1, "y": 1}],
        },
        headers=auth_headers,
    )

    assert resp.status_code == 422


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ビジネスロジックエラー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_upload_image_too_large(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """20MB 超のファイルで 413。"""
    # 21MB のダミーデータ（有効な画像ヘッダー + パディング）
    buf = _create_test_image()
    data = buf.getvalue()
    # 21MB に膨張させる
    padded = data + b"\x00" * (21 * 1024 * 1024 - len(data))
    large_buf = io.BytesIO(padded)

    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("large.jpg", large_buf, "image/jpeg")},
        headers=auth_headers,
    )

    assert resp.status_code == 413
    assert resp.json()["detail"] == "File too large. Maximum size is 20MB."


def test_process_image_invalid_upload_id(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない upload_id で 404。"""
    resp = client.post(
        "/api/v1/images/process",
        json={"upload_id": str(uuid4()), "corners": _make_corners()},
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Upload not found"


def test_process_image_ocr_timeout(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """OCR タイムアウト時に 408。"""
    # Setup: 画像アップロード
    upload_data = _upload_image(client, auth_headers)
    upload_id = upload_data["upload_id"]

    # OCR タイムアウトを模擬するパッチ
    with patch(
        "app.api.v1.endpoints.images.process_image_ocr",
        side_effect=TimeoutError("OCR timeout"),
    ):
        resp = client.post(
            "/api/v1/images/process",
            json={"upload_id": upload_id, "corners": _make_corners()},
            headers=auth_headers,
        )

    assert resp.status_code == 408
    assert resp.json()["detail"] == "OCR timeout. Please try again."


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エッジケース
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def test_get_image_namecard_without_image(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """画像なし名刺の画像取得で 404。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(
        db_session,
        user_dict["id"],
        image_path=None,
    )

    resp = client.get(
        f"/api/v1/images/{namecard.id}",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Image not found"


def test_get_thumbnail_no_image(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
    user_and_token: tuple[dict, str],
) -> None:
    """画像なし名刺のサムネイル取得で 404。"""
    user_dict, _ = user_and_token
    namecard = _create_namecard_with_image(
        db_session,
        user_dict["id"],
        image_path=None,
    )

    resp = client.get(
        f"/api/v1/images/{namecard.id}/thumbnail",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Image not found"


def test_get_image_nonexistent_namecard(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """存在しない名刺 ID で 404。"""
    resp = client.get(
        "/api/v1/images/99999",
        headers=auth_headers,
    )

    assert resp.status_code == 404


def test_upload_image_unsupported_format(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """非画像ファイルのアップロードでエラー。"""
    # テキストファイルを画像として送信
    buf = io.BytesIO(b"this is not an image file")
    resp = client.post(
        "/api/v1/images/upload",
        files={"file": ("test.txt", buf, "text/plain")},
        headers=auth_headers,
    )

    # 422（バリデーション）または 400（ビジネスロジック）を期待
    assert resp.status_code in (400, 422)
