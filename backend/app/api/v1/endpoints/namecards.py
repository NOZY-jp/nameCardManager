"""名刺 CRUD エンドポイント。

エンドポイント:
- GET    /namecards       – 名刺一覧（ページネーション、ソート、フィルタ）
- POST   /namecards       – 名刺作成（contact_methods, relationship_ids, tag_ids 一括）
- GET    /namecards/{id}  – 名刺詳細
- PATCH  /namecards/{id}  – 名刺更新（contact_methods は完全置換: NC-7）
- DELETE /namecards/{id}  – 名刺削除
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import asc, desc, func, select

from app.api.v1.deps import AuthUser, DbSession
from app.models import ContactMethod, NameCard, Relationship, Tag
from app.schemas import (
    ContactMethodResponse,
    NameCardCreate,
    NameCardUpdate,
    RelationshipResponse,
    TagResponse,
)

router = APIRouter()

# ソートに使えるフィールド（ホワイトリスト）
ALLOWED_SORT_FIELDS = {
    "created_at",
    "updated_at",
    "last_name",
    "first_name",
    "last_name_kana",
    "first_name_kana",
}


def _build_namecard_response(nc: NameCard, db: DbSession) -> dict:
    """NameCard モデルからレスポンス用 dict を構築する。"""
    return {
        "id": nc.id,
        "user_id": nc.user_id,
        "first_name": nc.first_name,
        "last_name": nc.last_name,
        "first_name_kana": nc.first_name_kana,
        "last_name_kana": nc.last_name_kana,
        "image_path": nc.image_path,
        "met_notes": nc.met_notes,
        "notes": nc.notes,
        "contact_methods": [
            ContactMethodResponse(
                id=cm.id,
                type=cm.type,
                value=cm.value,
                is_primary=cm.is_primary,
            )
            for cm in nc.contact_methods
        ],
        "relationships": [
            RelationshipResponse(
                id=r.id,
                name=r.name,
                parent_id=r.parent_id,
                full_path=r.get_full_path(db),
                created_at=nc.created_at,
                updated_at=nc.updated_at,
            )
            for r in nc.relationships
        ],
        "tags": [
            TagResponse(
                id=t.id,
                name=t.name,
                created_at=nc.created_at,
                updated_at=nc.updated_at,
            )
            for t in nc.tags
        ],
        "created_at": nc.created_at,
        "updated_at": nc.updated_at,
    }


def _get_user_namecard(db: DbSession, nc_id: int, user_id: int) -> NameCard:
    """ユーザー所有の名刺を取得。見つからなければ 404。"""
    nc = db.execute(
        select(NameCard).where(NameCard.id == nc_id, NameCard.user_id == user_id)
    ).scalar_one_or_none()

    if nc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Namecard not found",
        )
    return nc


def _validate_relationship_ids(
    db: DbSession, relationship_ids: list[int], user_id: int
) -> list[Relationship]:
    """relationship_ids の存在と所有権を検証する。"""
    if not relationship_ids:
        return []

    rels = (
        db.execute(select(Relationship).where(Relationship.id.in_(relationship_ids)))
        .scalars()
        .all()
    )

    found_ids = {r.id for r in rels}
    missing = set(relationship_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Relationship not found: {', '.join(str(i) for i in missing)}",
        )

    # 所有権チェック
    for r in rels:
        if r.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Relationship not found: {r.id}",
            )

    return list(rels)


def _validate_tag_ids(db: DbSession, tag_ids: list[int], user_id: int) -> list[Tag]:
    """tag_ids の存在と所有権を検証する。"""
    if not tag_ids:
        return []

    tags = db.execute(select(Tag).where(Tag.id.in_(tag_ids))).scalars().all()

    found_ids = {t.id for t in tags}
    missing = set(tag_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tag not found: {', '.join(str(i) for i in missing)}",
        )

    # 所有権チェック
    for t in tags:
        if t.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tag not found: {t.id}",
            )

    return list(tags)


# ─── GET /namecards ──────────────────────────────
@router.get("")
def list_namecards(
    current_user: AuthUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1),
    sort_by: str = Query(default="updated_at"),
    order: str = Query(default="desc"),
    tag_id: int | None = Query(default=None),
    relationship_id: int | None = Query(default=None),
) -> dict:
    """名刺一覧取得（ページネーション、ソート、フィルタ）。"""
    # per_page の上限制御
    if per_page > 100:
        per_page = 100

    # sort_by のバリデーション
    if sort_by not in ALLOWED_SORT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid sort_by field: {sort_by}. Allowed: {', '.join(sorted(ALLOWED_SORT_FIELDS))}",
        )

    # ベースクエリ（ユーザー分離）
    base_query = select(NameCard).where(NameCard.user_id == current_user.id)

    # フィルタ: tag_id
    if tag_id is not None:
        base_query = base_query.where(NameCard.tags.any(Tag.id == tag_id))

    # フィルタ: relationship_id
    if relationship_id is not None:
        base_query = base_query.where(
            NameCard.relationships.any(Relationship.id == relationship_id)
        )

    # 総件数
    count_query = select(func.count()).select_from(base_query.subquery())
    total = db.execute(count_query).scalar() or 0

    # ソート
    sort_column = getattr(NameCard, sort_by)
    if order == "asc":
        base_query = base_query.order_by(asc(sort_column))
    else:
        base_query = base_query.order_by(desc(sort_column))

    # ページネーション
    offset = (page - 1) * per_page
    base_query = base_query.offset(offset).limit(per_page)

    namecards = db.execute(base_query).scalars().all()
    total_pages = math.ceil(total / per_page) if per_page > 0 else 0

    return {
        "items": [_build_namecard_response(nc, db) for nc in namecards],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


# ─── POST /namecards ─────────────────────────────
@router.post("", status_code=status.HTTP_201_CREATED)
def create_namecard(
    body: NameCardCreate,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """名刺を作成する（contact_methods, relationship_ids, tag_ids 一括作成）。"""
    # relationship_ids / tag_ids のバリデーション
    rels = _validate_relationship_ids(db, body.relationship_ids, current_user.id)
    tags = _validate_tag_ids(db, body.tag_ids, current_user.id)

    # NameCard 作成
    nc = NameCard(
        user_id=current_user.id,
        first_name=body.first_name or "",
        last_name=body.last_name,
        first_name_kana=body.first_name_kana,
        last_name_kana=body.last_name_kana,
        image_path=body.image_path,
        met_notes=body.met_notes,
        notes=body.notes,
    )
    db.add(nc)
    db.flush()

    # ContactMethod 作成
    for cm_data in body.contact_methods:
        cm = ContactMethod(
            name_card_id=nc.id,
            type=cm_data.type,
            label="",
            value=cm_data.value,
            is_primary=cm_data.is_primary,
        )
        db.add(cm)

    # Relationship / Tag 関連付け
    nc.relationships = rels
    nc.tags = tags

    db.flush()
    db.refresh(nc)

    return _build_namecard_response(nc, db)


# ─── GET /namecards/{id} ─────────────────────────
@router.get("/{nc_id}")
def get_namecard(
    nc_id: int,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """名刺詳細を取得する。"""
    nc = _get_user_namecard(db, nc_id, current_user.id)
    return _build_namecard_response(nc, db)


# ─── PATCH /namecards/{id} ───────────────────────
@router.patch("/{nc_id}")
def update_namecard(
    nc_id: int,
    body: NameCardUpdate,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """名刺を更新する（contact_methods は完全置換: NC-7）。"""
    nc = _get_user_namecard(db, nc_id, current_user.id)

    # スカラーフィールドの部分更新
    update_data = body.model_dump(exclude_unset=True)

    for field in (
        "first_name",
        "last_name",
        "first_name_kana",
        "last_name_kana",
        "image_path",
        "met_notes",
        "notes",
    ):
        if field in update_data:
            setattr(nc, field, update_data[field])

    # updated_at を明示的に更新
    nc.updated_at = datetime.now(UTC)

    # relationship_ids が指定されたら置換
    if "relationship_ids" in update_data:
        rels = _validate_relationship_ids(
            db, update_data["relationship_ids"], current_user.id
        )
        nc.relationships = rels

    # tag_ids が指定されたら置換
    if "tag_ids" in update_data:
        tags = _validate_tag_ids(db, update_data["tag_ids"], current_user.id)
        nc.tags = tags

    # contact_methods が指定されたら完全置換（NC-7）
    if "contact_methods" in update_data:
        # 既存の contact_methods を全削除
        for cm in list(nc.contact_methods):
            db.delete(cm)
        db.flush()

        # 新規追加
        new_cms = []
        for cm_data in body.contact_methods:  # type: ignore[union-attr]
            cm = ContactMethod(
                name_card_id=nc.id,
                type=cm_data.type,
                label="",
                value=cm_data.value,
                is_primary=cm_data.is_primary,
            )
            db.add(cm)
            new_cms.append(cm)
        db.flush()
        nc.contact_methods = new_cms

    db.flush()
    db.refresh(nc)

    return _build_namecard_response(nc, db)


# ─── DELETE /namecards/{id} ──────────────────────
@router.delete("/{nc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_namecard(
    nc_id: int,
    current_user: AuthUser,
    db: DbSession,
) -> None:
    """名刺を削除する（contact_methods はカスケード削除）。"""
    nc = _get_user_namecard(db, nc_id, current_user.id)
    db.delete(nc)
    db.flush()
