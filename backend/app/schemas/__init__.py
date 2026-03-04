"""Pydantic schemas – API リクエスト / レスポンス定義。"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, EmailStr, Field


# ─── Auth / Internal ─────────────────────────────────────────
class CurrentUser(BaseModel):
    """認証依存性から返されるユーザー情報。"""

    id: int
    email: str


# ─── Auth Request ────────────────────────────────────────────
class UserCreate(BaseModel):
    """ユーザー登録リクエスト。"""

    email: EmailStr
    password: str


class UserLogin(BaseModel):
    """ログインリクエスト。"""

    email: EmailStr
    password: str


# ─── Auth Response ───────────────────────────────────────────
class Token(BaseModel):
    """JWT トークンレスポンス。"""

    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """ユーザー情報レスポンス。"""

    id: int
    email: str
    created_at: datetime


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ContactMethod（連絡先）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ContactMethodType(StrEnum):
    """連絡先の種類（24種）。"""

    email = "email"
    tel = "tel"
    mobile = "mobile"
    fax = "fax"
    website = "website"
    linkedin = "linkedin"
    twitter = "twitter"
    x = "x"
    facebook = "facebook"
    instagram = "instagram"
    line = "line"
    youtube = "youtube"
    discord = "discord"
    booth = "booth"
    github = "github"
    tiktok = "tiktok"
    wechat = "wechat"
    whatsapp = "whatsapp"
    telegram = "telegram"
    skype = "skype"
    zoom = "zoom"
    teams = "teams"
    address = "address"
    other = "other"


class ContactMethodCreate(BaseModel):
    """連絡先作成リクエスト。"""

    type: ContactMethodType
    value: str
    is_primary: bool = False


class ContactMethodResponse(BaseModel):
    """連絡先レスポンス。"""

    id: int
    type: ContactMethodType
    value: str
    is_primary: bool

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Relationship（組織階層）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class RelationshipCreate(BaseModel):
    """組織階層ノード作成リクエスト。"""

    name: str
    parent_id: int | None = None


class RelationshipUpdate(BaseModel):
    """組織階層ノード更新リクエスト。"""

    name: str | None = None
    parent_id: int | None = None


class RelationshipResponse(BaseModel):
    """組織階層ノードレスポンス。"""

    id: int
    name: str
    parent_id: int | None
    full_path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RelationshipTreeResponse(BaseModel):
    """組織階層ツリーレスポンス（再帰的子ノード含む）。"""

    id: int
    name: str
    parent_id: int | None
    children: list[RelationshipTreeResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tag（タグ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TagCreate(BaseModel):
    """タグ作成リクエスト。"""

    name: str


class TagUpdate(BaseModel):
    """タグ更新リクエスト。"""

    name: str


class TagResponse(BaseModel):
    """タグレスポンス。"""

    id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NameCard（名刺）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class NameCardCreate(BaseModel):
    """名刺作成リクエスト。OCR 結果（NC-1）と同一構造。"""

    first_name: str = ""
    last_name: str
    first_name_kana: str | None = None
    last_name_kana: str | None = None
    company_name: str | None = None
    department: str | None = None
    position: str | None = None
    image_path: str | None = None
    met_notes: str | None = None
    memo: str | None = None
    contact_methods: list[ContactMethodCreate] = []
    relationship_ids: list[int] = []
    tag_ids: list[int] = []


class NameCardUpdate(BaseModel):
    """名刺更新リクエスト（全フィールドオプショナル）。"""

    first_name: str | None = None
    last_name: str | None = None
    first_name_kana: str | None = None
    last_name_kana: str | None = None
    company_name: str | None = None
    department: str | None = None
    position: str | None = None
    image_path: str | None = None
    met_notes: str | None = None
    memo: str | None = None
    contact_methods: list[ContactMethodCreate] | None = None
    relationship_ids: list[int] | None = None
    tag_ids: list[int] | None = None


class NameCardResponse(BaseModel):
    """名刺レスポンス。"""

    id: int
    user_id: int
    first_name: str
    last_name: str
    first_name_kana: str | None
    last_name_kana: str | None
    company_name: str | None
    department: str | None
    position: str | None
    image_path: str | None
    met_notes: str | None
    memo: str | None
    contact_methods: list[ContactMethodResponse]
    relationships: list[RelationshipResponse]
    tags: list[TagResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NameCardListResponse(BaseModel):
    """名刺一覧レスポンス（ページネーション付き）。"""

    items: list[NameCardResponse]
    total: int
    page: int
    per_page: int
    pages: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Search（検索）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SearchRequest(BaseModel):
    """検索リクエスト。"""

    q: str | None = None
    tag_ids: list[int] | None = None
    relationship_ids: list[int] | None = None
    met_after: date | None = None
    met_before: date | None = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
    sort_by: str = "updated_at"
    order: str = "desc"


class SearchResponse(BaseModel):
    """検索レスポンス（ページネーション付き）。"""

    items: list[NameCardResponse]
    total: int
    page: int
    per_page: int
    pages: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  JSON Export / Import
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ExportResponse(BaseModel):
    """JSON エクスポートレスポンス。"""

    exported_at: datetime
    version: str
    relationships: list[RelationshipResponse]
    tags: list[TagResponse]
    namecards: list[NameCardResponse]


class ImportRequest(BaseModel):
    """JSON インポートリクエスト（ExportResponse と同一構造）。"""

    exported_at: datetime
    version: str
    relationships: list[RelationshipResponse]
    tags: list[TagResponse]
    namecards: list[NameCardResponse]


class ImportResponse(BaseModel):
    """JSON インポート結果レスポンス。"""

    imported_namecards: int
    imported_relationships: int
    imported_tags: int
    skipped_namecards: int
    skipped_relationships: int
    skipped_tags: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Image Processing（画像処理）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ImageUploadResponse(BaseModel):
    """画像アップロードレスポンス。"""

    upload_id: str
    message: str


class CornerCoordinates(BaseModel):
    """四隅座標（遠近補正用）。"""

    top_left: tuple[float, float]
    top_right: tuple[float, float]
    bottom_left: tuple[float, float]
    bottom_right: tuple[float, float]


class ImageProcessRequest(BaseModel):
    """画像処理リクエスト（四隅座標送信）。"""

    upload_id: str
    corners: CornerCoordinates


class ImageProcessResponse(BaseModel):
    """画像処理レスポンス（OCR 結果 + 画像パス）。"""

    ocr_result: NameCardCreate
    image_path: str
    thumbnail_path: str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  __all__
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

__all__ = [
    # Auth
    "CurrentUser",
    "UserCreate",
    "UserLogin",
    "Token",
    "UserResponse",
    # ContactMethod
    "ContactMethodType",
    "ContactMethodCreate",
    "ContactMethodResponse",
    # Relationship
    "RelationshipCreate",
    "RelationshipUpdate",
    "RelationshipResponse",
    "RelationshipTreeResponse",
    # Tag
    "TagCreate",
    "TagUpdate",
    "TagResponse",
    # NameCard
    "NameCardCreate",
    "NameCardUpdate",
    "NameCardResponse",
    "NameCardListResponse",
    # Search
    "SearchRequest",
    "SearchResponse",
    # Export / Import
    "ExportResponse",
    "ImportRequest",
    "ImportResponse",
    # Image Processing
    "ImageUploadResponse",
    "CornerCoordinates",
    "ImageProcessRequest",
    "ImageProcessResponse",
]
