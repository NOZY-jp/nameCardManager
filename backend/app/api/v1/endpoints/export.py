"""JSON エクスポートエンドポイント。

エンドポイント:
- GET /export/json – 全ユーザーデータを JSON エクスポート
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.api.v1.deps import AuthUser, DbSession
from app.models import NameCard, Relationship, Tag
from app.schemas import (
    ContactMethodResponse,
    NameCardImageResponse,
    RelationshipResponse,
    TagResponse,
)

router = APIRouter()


def _build_relationship_response(r: Relationship, db: Session) -> dict:
    """Relationship モデルからレスポンス用 dict を構築する。"""
    return {
        "id": r.id,
        "name": r.name,
        "parent_id": r.parent_id,
        "full_path": r.get_full_path(db),
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def _build_tag_response(t: Tag) -> dict:
    """Tag モデルからレスポンス用 dict を構築する。"""
    return {
        "id": t.id,
        "name": t.name,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def _build_namecard_response(nc: NameCard, db: Session) -> dict:
    """NameCard モデルからエクスポート用 dict を構築する。"""
    return {
        "id": nc.id,
        "user_id": nc.user_id,
        "first_name": nc.first_name,
        "last_name": nc.last_name,
        "first_name_kana": nc.first_name_kana,
        "last_name_kana": nc.last_name_kana,
        "company_name": nc.company_name,
        "department": nc.department,
        "position": nc.position,
        "images": [
            NameCardImageResponse(
                id=img.id,
                image_path=img.image_path,
                position=img.position,
                created_at=img.created_at,
            ).model_dump()
            for img in nc.images
        ],
        "met_notes": nc.met_notes,
        "memo": nc.memo,
        "contact_methods": [
            ContactMethodResponse(
                id=cm.id,
                type=cm.type,
                value=cm.value,
                is_primary=cm.is_primary,
            ).model_dump()
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
            ).model_dump()
            for r in nc.relationships
        ],
        "tags": [
            TagResponse(
                id=t.id,
                name=t.name,
                created_at=nc.created_at,
                updated_at=nc.updated_at,
            ).model_dump()
            for t in nc.tags
        ],
        "relationship_ids": [r.id for r in nc.relationships],
        "tag_ids": [t.id for t in nc.tags],
        "created_at": nc.created_at.isoformat() if nc.created_at else None,
        "updated_at": nc.updated_at.isoformat() if nc.updated_at else None,
    }


@router.get("/json")
def export_json(
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """全ユーザーデータを JSON エクスポートする。

    relationships は parent_id 昇順（null 先頭）でエクスポートされる（NC-8）。
    """
    # Relationships: parent_id 昇順（NULL 先頭 = NULLS FIRST）
    rels = (
        db.execute(
            select(Relationship)
            .where(Relationship.user_id == current_user.id)
            .order_by(asc(Relationship.parent_id).nulls_first(), asc(Relationship.id))
        )
        .scalars()
        .all()
    )

    # Tags
    tags = (
        db.execute(select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.id))
        .scalars()
        .all()
    )

    # NameCards
    namecards = (
        db.execute(
            select(NameCard)
            .where(NameCard.user_id == current_user.id)
            .order_by(NameCard.id)
        )
        .scalars()
        .all()
    )

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "version": "1.0",
        "relationships": [_build_relationship_response(r, db) for r in rels],
        "tags": [_build_tag_response(t) for t in tags],
        "namecards": [_build_namecard_response(nc, db) for nc in namecards],
    }
