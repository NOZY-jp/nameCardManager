"""検索エンドポイント。

GET /api/v1/search – pg_bigm によるキーワード横断検索 + フィルタリング
"""

from __future__ import annotations

import math
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.sql import func

from app.api.v1.deps import AuthUser, DbSession
from app.models import ContactMethod, NameCard, NameCardRelationship, Relationship, Tag
from app.schemas import (
    ContactMethodResponse,
    RelationshipResponse,
    TagResponse,
)

router = APIRouter()


def _parse_comma_ids(raw: str) -> list[int]:
    """カンマ区切り文字列を int リストに変換する。

    空文字列なら空リストを返す。数値でない要素がある場合は 422 を送出。
    """
    if not raw.strip():
        return []
    parts = raw.split(",")
    result: list[int] = []
    for p in parts:
        stripped = p.strip()
        if not stripped:
            continue
        try:
            result.append(int(stripped))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid ID value: {stripped}",
            ) from None
    return result


def _parse_datetime(value: str | None) -> datetime | None:
    """ISO 8601 文字列を datetime に変換する。None なら None を返す。"""
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


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


@router.get("")
def search_namecards(
    current_user: AuthUser,
    db: DbSession,
    q: str | None = Query(default=None),
    tag_ids: str | None = Query(default=None),
    relationship_ids: str | None = Query(default=None),
    created_at_start: str | None = Query(default=None),
    created_at_end: str | None = Query(default=None),
    updated_at_start: str | None = Query(default=None),
    updated_at_end: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="updated_at"),
    order: str = Query(default="desc"),
) -> dict:
    """キーワード横断検索（pg_bigm 使用）。

    テキスト検索対象:
    - name_cards: first_name, last_name, first_name_kana, last_name_kana, notes, met_notes
    - relationships: full_path（祖先含む再帰 CTE で name を検索）
    - contact_methods: value (via join)
    """
    # ── tag_ids / relationship_ids のパース ──
    parsed_tag_ids: list[int] = []
    if tag_ids is not None:
        parsed_tag_ids = _parse_comma_ids(tag_ids)

    parsed_rel_ids: list[int] = []
    if relationship_ids is not None:
        parsed_rel_ids = _parse_comma_ids(relationship_ids)

    # ── datetime パース ──
    dt_created_start = _parse_datetime(created_at_start)
    dt_created_end = _parse_datetime(created_at_end)
    dt_updated_start = _parse_datetime(updated_at_start)
    dt_updated_end = _parse_datetime(updated_at_end)

    # ── ベースクエリ（ユーザー分離） ──
    base_query = select(NameCard).where(NameCard.user_id == current_user.id)

    # ── テキスト検索 ──
    if q and q.strip():
        keyword = q.strip()
        like_pattern = f"%{keyword}%"

        # name_cards 自身のカラムに対する LIKE 条件
        text_conditions = [
            NameCard.first_name.ilike(like_pattern),
            NameCard.last_name.ilike(like_pattern),
            NameCard.first_name_kana.ilike(like_pattern),
            NameCard.last_name_kana.ilike(like_pattern),
            NameCard.notes.ilike(like_pattern),
            NameCard.met_notes.ilike(like_pattern),
        ]

        # relationships の祖先を含む全 name で検索（再帰 CTE）
        # 名刺に紐づく relationship とその全祖先の name を検索対象にする
        r_tbl = Relationship.__table__

        # アンカー: 名刺に紐づく relationship
        anchor = (
            select(
                NameCardRelationship.name_card_id.label("nc_id"),
                r_tbl.c.id,
                r_tbl.c.parent_id,
                r_tbl.c.name,
            )
            .select_from(NameCardRelationship.__table__)
            .join(r_tbl, r_tbl.c.id == NameCardRelationship.relationship_id)
            .cte(name="rel_ancestors", recursive=True)
        )

        # 再帰部: 親をたどる
        recursive = (
            select(
                anchor.c.nc_id,
                r_tbl.c.id,
                r_tbl.c.parent_id,
                r_tbl.c.name,
            )
            .select_from(anchor)
            .join(r_tbl, r_tbl.c.id == anchor.c.parent_id)
        )
        cte = anchor.union_all(recursive)

        rel_subquery = (
            select(cte.c.nc_id).where(cte.c.name.ilike(like_pattern)).distinct()
        )
        text_conditions.append(NameCard.id.in_(rel_subquery))

        # contact_methods.value での検索
        cm_subquery = select(ContactMethod.name_card_id).where(
            ContactMethod.value.ilike(like_pattern)
        )
        text_conditions.append(NameCard.id.in_(cm_subquery))

        base_query = base_query.where(or_(*text_conditions))

    # ── tag_ids フィルタ ──
    if parsed_tag_ids:
        base_query = base_query.where(NameCard.tags.any(Tag.id.in_(parsed_tag_ids)))

    # ── relationship_ids フィルタ ──
    if parsed_rel_ids:
        base_query = base_query.where(
            NameCard.relationships.any(Relationship.id.in_(parsed_rel_ids))
        )

    # ── created_at 範囲フィルタ ──
    if dt_created_start is not None:
        base_query = base_query.where(NameCard.created_at >= dt_created_start)
    if dt_created_end is not None:
        base_query = base_query.where(NameCard.created_at <= dt_created_end)

    # ── updated_at 範囲フィルタ ──
    if dt_updated_start is not None:
        base_query = base_query.where(NameCard.updated_at >= dt_updated_start)
    if dt_updated_end is not None:
        base_query = base_query.where(NameCard.updated_at <= dt_updated_end)

    # ── 総件数 ──
    count_query = select(func.count()).select_from(base_query.subquery())
    total = db.execute(count_query).scalar() or 0

    # ── ソート ──
    allowed_sort = {
        "created_at",
        "updated_at",
        "last_name",
        "first_name",
        "last_name_kana",
        "first_name_kana",
    }
    if sort_by not in allowed_sort:
        sort_by = "updated_at"

    sort_column = getattr(NameCard, sort_by)
    if order == "asc":
        base_query = base_query.order_by(sort_column.asc())
    else:
        base_query = base_query.order_by(sort_column.desc())

    # ── ページネーション ──
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
