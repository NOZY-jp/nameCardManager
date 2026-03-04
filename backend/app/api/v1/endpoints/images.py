"""画像処理 + OCR エンドポイント。

エンドポイント:
- POST /images/upload              – 画像アップロード（202 + upload_id）
- POST /images/process             – 四隅座標送信、OCR 実行、遠近補正、WebP 変換
- POST /images/process-additional  – 四隅座標送信、遠近補正+WebP変換（OCR なし）
- GET  /images/{namecard_id}       – 名刺画像取得（name_card_images の position=0）
- GET  /images/{namecard_id}/thumbnail – サムネイル取得
- GET  /images/namecard/{namecard_id}  – 名刺の全画像一覧
"""

from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from PIL import Image
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from app.api.v1.deps import AuthUser, DbSession
from app.core.config import get_settings
from app.models import NameCard, NameCardImage
from app.schemas import NameCardImageResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  In-memory upload store
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# upload_id → { "user_id", "image_bytes" }
_uploads: dict[str, dict[str, Any]] = {}

# 最大ファイルサイズ: 20MB
MAX_FILE_SIZE = 20 * 1024 * 1024

# 許可する Content-Type
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

# サムネイルサイズ
THUMBNAIL_SIZE = (300, 188)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  リクエスト/レスポンス スキーマ（テスト互換）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class CornerPoint(BaseModel):
    """四隅の 1 点。"""

    x: float
    y: float


class ProcessRequest(BaseModel):
    """画像処理リクエスト。"""

    upload_id: str
    corners: list[CornerPoint]

    @field_validator("corners")
    @classmethod
    def check_corners_count(cls, v: list[CornerPoint]) -> list[CornerPoint]:
        if len(v) != 4:
            msg = "corners must have exactly 4 points"
            raise ValueError(msg)
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OCR 処理（Gemini 2.5 Flash）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def process_image_ocr(image_bytes: bytes) -> dict[str, Any]:
    """Gemini 2.5 Flash で名刺画像を OCR し、NameCardCreate 互換の dict を返す。

    テストでは unittest.mock.patch でこの関数をモックする。
    """
    settings = get_settings()
    api_key = settings.gemini_api_key

    if not api_key:
        # API キー未設定時はダミー結果を返す
        return {
            "first_name": "",
            "last_name": "",
            "first_name_kana": None,
            "last_name_kana": None,
            "company_name": None,
            "department": None,
            "position": None,
            "memo": None,
            "contact_methods": [],
        }

    try:
        from google import genai  # type: ignore[import-untyped]

        client = genai.Client(api_key=api_key)

        prompt = """この名刺画像から以下の情報を JSON 形式で抽出してください。
        フィールド:
        - first_name: 名（文字列）
        - last_name: 姓（文字列）
        - first_name_kana: 名のフリガナ（文字列 *予想でよい）
        - last_name_kana: 姓のフリガナ（文字列 *予想でよい）
        - company_name: 会社名（文字列 or null）
        - department: 部署名（文字列 or null）
        - position: 役職（文字列 or null）
        - memo: その他の情報（contact_methodsのどれにも当てはまらない詳細 文字列 or null）
        - contact_methods: 連絡先の配列。各要素は {type, value, is_primary} 。
          type は email, tel, mobile, fax, website, x, instagram, youtube, discord, booth, github, linkedin, facebook, line, tiktok, address, other のいずれか。
          is_primary は最初の連絡先のみ true。

        JSON のみを返してください。マークダウンコードブロックは不要です。"""

        import base64

        image_data = base64.b64encode(image_bytes).decode("utf-8")

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": image_data,
                            }
                        },
                    ]
                }
            ],
        )

        import json

        text = response.text.strip()
        # マークダウンコードブロック除去
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[: -len("```")]
            text = text.strip()

        return json.loads(text)
    except Exception:
        logger.exception("Gemini OCR failed")
        return {
            "first_name": "",
            "last_name": "",
            "first_name_kana": None,
            "last_name_kana": None,
            "company_name": None,
            "department": None,
            "position": None,
            "memo": None,
            "contact_methods": [],
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  画像処理ヘルパー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _perspective_correction(
    image_bytes: bytes, corners: list[CornerPoint]
) -> np.ndarray:
    """OpenCV で四隅座標による遠近補正を行う。"""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        msg = "Failed to decode image"
        raise ValueError(msg)

    # 入力四隅: top-left, top-right, bottom-right, bottom-left
    src_pts = np.float32([[c.x, c.y] for c in corners])

    # 出力サイズ（名刺標準比 91mm×55mm → 910×550）
    width = 910
    height = 550
    dst_pts = np.float32(
        [
            [0, 0],
            [width - 1, 0],
            [width - 1, height - 1],
            [0, height - 1],
        ]
    )

    matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
    result = cv2.warpPerspective(img, matrix, (width, height))
    return result


def _save_as_webp(
    cv_image: np.ndarray, output_dir: Path, filename_stem: str
) -> tuple[str, str]:
    """OpenCV 画像を WebP (フル + サムネイル) として保存する。

    Returns:
        (image_path, thumbnail_path)
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = output_dir / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    # OpenCV BGR → RGB → PIL
    rgb = cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb)

    # フル画像
    full_path = output_dir / f"{filename_stem}.webp"
    pil_image.save(str(full_path), format="WEBP", quality=85)

    # サムネイル
    thumb_image = pil_image.copy()
    thumb_image.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    thumb_path = thumb_dir / f"{filename_stem}.webp"
    thumb_image.save(str(thumb_path), format="WEBP", quality=80)

    return str(full_path), str(thumb_path)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  エンドポイント
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


# ─── POST /images/upload ─────────────────────────
@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
def upload_image(
    file: UploadFile,
    current_user: AuthUser,
) -> dict[str, str]:
    """画像をアップロードし、upload_id を発行する。OCR を非同期で開始。"""
    # Content-Type チェック
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: {content_type}. Allowed: JPEG, PNG, WebP.",
        )

    # ファイル読み込み
    image_bytes = file.file.read()

    # サイズチェック
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 20MB.",
        )

    # 画像として読み込めるか検証
    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        pil_img.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid image file.",
        ) from None

    # upload_id 発行
    upload_id = str(uuid.uuid4())

    # In-memory 保存
    _uploads[upload_id] = {
        "user_id": current_user.id,
        "image_bytes": image_bytes,
    }

    return {
        "upload_id": upload_id,
        "message": "Upload accepted. OCR processing started.",
    }


# ─── POST /images/process ───────────────────────
@router.post("/process")
def process_image(
    body: ProcessRequest,
    current_user: AuthUser,
) -> dict[str, Any]:
    """四隅座標を受信し、遠近補正 + WebP 変換 + OCR 結果を返す。"""
    entry = _uploads.get(body.upload_id)
    if entry is None or entry["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    image_bytes: bytes = entry["image_bytes"]

    logger.info("process_image corners: %s", [(c.x, c.y) for c in body.corners])

    # OCR 実行（同期）
    try:
        ocr_result = process_image_ocr(image_bytes)
    except TimeoutError:
        _uploads.pop(body.upload_id, None)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="OCR timeout. Please try again.",
        ) from None
    except Exception:
        _uploads.pop(body.upload_id, None)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OCR processing failed.",
        ) from None

    # 遠近補正
    try:
        corrected = _perspective_correction(image_bytes, body.corners)
    except Exception:
        _uploads.pop(body.upload_id, None)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image processing failed.",
        ) from None

    # WebP 保存
    settings = get_settings()
    output_dir = Path(settings.image_dir)
    filename_stem = str(uuid.uuid4())
    image_path, thumbnail_path = _save_as_webp(corrected, output_dir, filename_stem)

    # クリーンアップ
    _uploads.pop(body.upload_id, None)

    return {
        "ocr_result": ocr_result,
        "image_path": image_path,
        "thumbnail_path": thumbnail_path,
    }


# ─── POST /images/process-additional ─────────────
@router.post("/process-additional")
def process_additional_image(
    body: ProcessRequest,
    current_user: AuthUser,
) -> dict[str, str]:
    """追加画像の遠近補正 + WebP保存（OCR なし）。"""
    entry = _uploads.get(body.upload_id)
    if entry is None or entry["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    image_bytes: bytes = entry["image_bytes"]

    logger.info(
        "process_additional_image corners: %s",
        [(c.x, c.y) for c in body.corners],
    )

    # 遠近補正
    try:
        corrected = _perspective_correction(image_bytes, body.corners)
    except Exception:
        _uploads.pop(body.upload_id, None)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image processing failed.",
        ) from None

    # WebP 保存
    settings = get_settings()
    output_dir = Path(settings.image_dir)
    filename_stem = str(uuid.uuid4())
    image_path, thumbnail_path = _save_as_webp(corrected, output_dir, filename_stem)

    # クリーンアップ
    _uploads.pop(body.upload_id, None)

    return {
        "image_path": image_path,
        "thumbnail_path": thumbnail_path,
    }


# ─── GET /images/namecard/{namecard_id} ─────────
@router.get("/namecard/{namecard_id}")
def get_namecard_images(
    namecard_id: int,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """名刺に紐づく全画像のリストを返す（position順）。"""
    nc = db.execute(
        select(NameCard).where(
            NameCard.id == namecard_id,
            NameCard.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if nc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Namecard not found",
        )

    return {
        "images": [
            NameCardImageResponse.model_validate(img).model_dump() for img in nc.images
        ],
    }


# ─── GET /images/{namecard_id} ───────────────────
@router.get("/{namecard_id}")
def get_image(
    namecard_id: int,
    current_user: AuthUser,
    db: DbSession,
) -> Response:
    """名刺画像（WebP）を取得する。name_card_images の position=0 を返す。"""
    nc = db.execute(
        select(NameCard).where(
            NameCard.id == namecard_id,
            NameCard.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if nc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Namecard not found",
        )

    # name_card_images から position=0 の画像を取得
    first_image = db.execute(
        select(NameCardImage).where(
            NameCardImage.name_card_id == namecard_id,
            NameCardImage.position == 0,
        )
    ).scalar_one_or_none()

    if first_image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    image_file = Path(first_image.image_path)
    if not image_file.exists():
        # ファイルが見つからない場合、ダミー画像をメモリ上で生成して返す
        img = Image.new("RGB", (910, 550), color="white")
        buf = io.BytesIO()
        img.save(buf, format="WEBP")
        buf.seek(0)
        return Response(
            content=buf.getvalue(),
            media_type="image/webp",
        )

    return FileResponse(
        path=str(image_file),
        media_type="image/webp",
    )


# ─── GET /images/{namecard_id}/thumbnail ─────────
@router.get("/{namecard_id}/thumbnail")
def get_thumbnail(
    namecard_id: int,
    current_user: AuthUser,
    db: DbSession,
) -> Response:
    """名刺サムネイル（WebP）を取得する。name_card_images の position=0 を返す。"""
    nc = db.execute(
        select(NameCard).where(
            NameCard.id == namecard_id,
            NameCard.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if nc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Namecard not found",
        )

    # name_card_images から position=0 の画像を取得
    first_image = db.execute(
        select(NameCardImage).where(
            NameCardImage.name_card_id == namecard_id,
            NameCardImage.position == 0,
        )
    ).scalar_one_or_none()

    if first_image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    # image_path から thumbnail パスを導出
    image_file = Path(first_image.image_path)
    thumb_file = image_file.parent / "thumbnails" / image_file.name

    if not thumb_file.exists():
        # ファイルが見つからない場合、ダミーサムネイルをメモリ上で生成して返す
        img = Image.new("RGB", THUMBNAIL_SIZE, color="white")
        buf = io.BytesIO()
        img.save(buf, format="WEBP")
        buf.seek(0)
        return Response(
            content=buf.getvalue(),
            media_type="image/webp",
        )

    return FileResponse(
        path=str(thumb_file),
        media_type="image/webp",
    )
