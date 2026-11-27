"""名刺画像の OCR。

プロバイダは `OCR_PROVIDER` で切り替える。

- ``bedrock``: Amazon Bedrock（Amazon Nova Lite など）。後払い・画像1枚230トークン固定課金。
- ``gemini``: Google Gemini（従来実装）。プリペイド残高が必要。
- ``none``: 外部呼び出しをせず空の結果を返す（開発・テスト用）。

呼び出し側は :func:`extract_business_card` だけを使えばよい。
失敗は :class:`OcrError` で通知する（空の名刺を黙って返さない）。
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

# 連絡先の種別（フロントの型と一致させる）
CONTACT_METHOD_TYPES: list[str] = [
    "email",
    "tel",
    "mobile",
    "fax",
    "website",
    "x",
    "instagram",
    "youtube",
    "discord",
    "booth",
    "github",
    "linkedin",
    "facebook",
    "line",
    "tiktok",
    "address",
    "other",
]

_CONTACT_TYPE_SET = set(CONTACT_METHOD_TYPES)

# Gemini の structured output 用スキーマ（OpenAPI サブセット）。
# Bedrock はスキーマ指定に対応しないため、同じ形をプロンプトで要求しパースする。
OCR_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "first_name": {"type": "string"},
        "last_name": {"type": "string"},
        "first_name_kana": {"type": "string", "nullable": True},
        "last_name_kana": {"type": "string", "nullable": True},
        "company_name": {"type": "string", "nullable": True},
        "department": {"type": "string", "nullable": True},
        "position": {"type": "string", "nullable": True},
        "memo": {"type": "string", "nullable": True},
        "contact_methods": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": CONTACT_METHOD_TYPES},
                    "value": {"type": "string"},
                    "is_primary": {"type": "boolean"},
                },
                "required": ["type", "value", "is_primary"],
            },
        },
    },
    "required": ["first_name", "last_name", "contact_methods"],
}

OCR_PROMPT = """この名刺画像から以下の情報を JSON 形式で抽出してください。
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
  type は email, tel, mobile, fax, website, x, instagram, youtube, discord, booth, github,
  linkedin, facebook, line, tiktok, address, other のいずれか。
  is_primary は最初の連絡先のみ true。

画像に書かれていない項目は null にし、推測で埋めないでください。
文字は画像のとおりに写してください（異体字を常用漢字に置き換えない）。
JSON のみを返してください。マークダウンコードブロックは不要です。"""

_NULLABLE_FIELDS = (
    "first_name_kana",
    "last_name_kana",
    "company_name",
    "department",
    "position",
    "memo",
)


class OcrError(RuntimeError):
    """OCR プロバイダの呼び出しに失敗した。"""


def empty_result() -> dict[str, Any]:
    """項目をすべて空にした結果。テストやプロバイダ未設定時に使う。"""
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
#  画像形式
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def detect_image_format(image_bytes: bytes) -> str:
    """マジックバイトから画像形式を返す（jpeg / png / webp / gif）。

    判定できない場合は jpeg とみなす。
    """
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "webp"
    if image_bytes[:4] == b"GIF8":
        return "gif"
    return "jpeg"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  パースと正規化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def parse_json_response(text: str) -> dict[str, Any]:
    """モデルの応答から JSON オブジェクトを取り出す。

    コードフェンスや前後の説明文が付いていても拾えるようにする。
    """
    raw = (text or "").strip()
    if not raw:
        msg = "OCR の応答が空です"
        raise OcrError(msg)

    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[: -len("```")]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            msg = "OCR の応答を JSON として解釈できません"
            raise OcrError(msg) from None
        try:
            parsed = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as exc:
            msg = f"OCR の応答を JSON として解釈できません: {exc}"
            raise OcrError(msg) from exc

    if not isinstance(parsed, dict):
        msg = "OCR の応答が JSON オブジェクトではありません"
        raise OcrError(msg)
    return parsed


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_result(raw: dict[str, Any]) -> dict[str, Any]:
    """モデルの出力をアプリの期待する形に整える。

    - すべてのキーを揃える（欠けは空）
    - 連絡先の type を既知の値に丸める
    - is_primary が複数/ゼロにならないようにする（先頭のみ true）
    """
    result = empty_result()
    result["first_name"] = _clean_str(raw.get("first_name")) or ""
    result["last_name"] = _clean_str(raw.get("last_name")) or ""
    for field in _NULLABLE_FIELDS:
        result[field] = _clean_str(raw.get(field))

    contacts: list[dict[str, Any]] = []
    raw_contacts = raw.get("contact_methods")
    if isinstance(raw_contacts, list):
        for item in raw_contacts:
            if not isinstance(item, dict):
                continue
            value = _clean_str(item.get("value"))
            if not value:
                continue
            ctype = _clean_str(item.get("type")) or "other"
            ctype = ctype.lower()
            if ctype not in _CONTACT_TYPE_SET:
                ctype = "other"
            contacts.append({"type": ctype, "value": value, "is_primary": False})

    if contacts:
        contacts[0]["is_primary"] = True
    result["contact_methods"] = contacts
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ: Amazon Bedrock
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_THROTTLE_CODES = {"ThrottlingException", "TooManyRequestsException"}


def _build_bedrock_client(settings: Settings) -> Any:
    import boto3  # 遅延 import（未導入の環境でも他プロバイダで動かす）
    from botocore.config import Config

    return boto3.client(
        "bedrock-runtime",
        region_name=settings.aws_region,
        config=Config(
            connect_timeout=settings.ocr_timeout_seconds,
            read_timeout=settings.ocr_timeout_seconds,
            retries={"max_attempts": 0},
        ),
    )


def _ocr_bedrock(image_bytes: bytes, settings: Settings) -> dict[str, Any]:
    from botocore.exceptions import BotoCoreError, ClientError

    image_format = detect_image_format(image_bytes)
    if image_format == "gif":
        # Converse API の画像形式に対応しないため JPEG として送らない
        msg = "GIF は OCR に未対応です（JPEG/PNG/WebP を使用してください）"
        raise OcrError(msg)

    client = _build_bedrock_client(settings)
    request: dict[str, Any] = {
        "modelId": settings.bedrock_model_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"text": OCR_PROMPT},
                    {"image": {"format": image_format, "source": {"bytes": image_bytes}}},
                ],
            }
        ],
        "inferenceConfig": {
            "maxTokens": settings.ocr_max_tokens,
            "temperature": 0.0,
            "topP": 0.9,
        },
    }

    response: dict[str, Any] | None = None
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.converse(**request)
            break
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            last_error = exc
            if code in _THROTTLE_CODES and attempt == 0:
                time.sleep(0.5)
                continue
            msg = f"Bedrock 呼び出しに失敗しました: {code or 'unknown'}"
            raise OcrError(msg) from exc
        except (BotoCoreError, OSError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.5)
                continue
            msg = f"Bedrock へ接続できません: {exc}"
            raise OcrError(msg) from exc

    if response is None:
        msg = f"Bedrock の応答を取得できません: {last_error}"
        raise OcrError(msg)

    blocks = response.get("output", {}).get("message", {}).get("content", [])
    text = "".join(block.get("text", "") for block in blocks)
    if not text.strip():
        msg = "Bedrock の応答が空です"
        raise OcrError(msg)

    usage = response.get("usage", {})
    logger.info(
        "bedrock ocr done model=%s in=%s out=%s",
        settings.bedrock_model_id,
        usage.get("inputTokens"),
        usage.get("outputTokens"),
    )
    return parse_json_response(text)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  プロバイダ: Google Gemini（従来実装）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _ocr_gemini(image_bytes: bytes, settings: Settings) -> dict[str, Any]:
    if not settings.gemini_api_key:
        msg = "GEMINI_API_KEY が設定されていません"
        raise OcrError(msg)

    import base64

    from google import genai  # type: ignore[import-untyped]
    from google.genai import types  # type: ignore[import-untyped]

    client = genai.Client(api_key=settings.gemini_api_key)
    image_data = base64.b64encode(image_bytes).decode("utf-8")
    mime = f"image/{detect_image_format(image_bytes)}"

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                {
                    "parts": [
                        {"text": OCR_PROMPT},
                        {"inline_data": {"mime_type": mime, "data": image_data}},
                    ]
                }
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OCR_RESPONSE_SCHEMA,
            ),
        )
    except Exception as exc:  # ライブラリ固有の例外をまとめて扱う
        msg = f"Gemini 呼び出しに失敗しました: {exc}"
        raise OcrError(msg) from exc

    return parse_json_response(getattr(response, "text", "") or "")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  入口
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_PROVIDERS = {
    "bedrock": _ocr_bedrock,
    "gemini": _ocr_gemini,
}


def extract_business_card(
    image_bytes: bytes, settings: Settings | None = None
) -> dict[str, Any]:
    """名刺画像から項目を抽出する。

    :raises OcrError: プロバイダが失敗した、または設定が不足している。
    """
    settings = settings or get_settings()
    provider = (settings.ocr_provider or "none").strip().lower()

    if provider == "none":
        logger.warning("OCR_PROVIDER=none のため OCR を実行しません")
        return empty_result()

    handler = _PROVIDERS.get(provider)
    if handler is None:
        msg = f"未知の OCR_PROVIDER です: {provider}（bedrock / gemini / none）"
        raise OcrError(msg)

    raw = handler(image_bytes, settings)
    return normalize_result(raw)


def extract_business_card_safe(
    image_bytes: bytes, settings: Settings | None = None
) -> dict[str, Any]:
    """失敗しても例外を投げず空の結果を返す版（従来の挙動）。

    失敗を利用者に見せたい場合は :func:`extract_business_card` を使う。
    """
    try:
        return extract_business_card(image_bytes, settings)
    except OcrError:
        logger.exception("OCR failed; returning empty result")
        return empty_result()
