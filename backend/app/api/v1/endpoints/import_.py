"""JSON インポートエンドポイント。

エンドポイント:
- POST /import/json – JSON データをインポート

注意: `import` は Python の予約語のため、ファイル名は `import_.py`。
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.v1.deps import AuthUser, DbSession
from app.models import ContactMethod, NameCard, Relationship, Tag


router = APIRouter()


@router.post("/json")
async def import_json(
    request: Request,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    """JSON データをインポートする。

    既存レコード（ID または名前の一意制約）はスキップする。
    """
    # --- リクエストボディのパース ---
    body = await request.body()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format",
        )

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format",
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format",
        )

    # --- カウンター ---
    imported_relationships = 0
    skipped_relationships = 0
    imported_tags = 0
    skipped_tags = 0
    imported_namecards = 0
    skipped_namecards = 0

    # ID マッピング: インポート元 ID → DB 上の ID
    rel_id_map: dict[int, int] = {}
    tag_id_map: dict[int, int] = {}

    # --- Relationships のインポート ---
    for rel_data in payload.get("relationships", []):
        orig_id = rel_data.get("id")

        # ID が指定されていて既存レコードがあればスキップ
        if orig_id is not None:
            existing = db.execute(
                select(Relationship).where(Relationship.id == orig_id)
            ).scalar_one_or_none()
            if existing is not None:
                rel_id_map[orig_id] = existing.id
                skipped_relationships += 1
                continue

        # parent_id のマッピング解決
        parent_id = rel_data.get("parent_id")
        if parent_id is not None and parent_id in rel_id_map:
            parent_id = rel_id_map[parent_id]

        new_rel = Relationship(
            user_id=current_user.id,
            name=rel_data["name"],
            parent_id=parent_id,
        )
        db.add(new_rel)
        db.flush()

        if orig_id is not None:
            rel_id_map[orig_id] = new_rel.id
        imported_relationships += 1

    # --- Tags のインポート ---
    for tag_data in payload.get("tags", []):
        orig_id = tag_data.get("id")
        tag_name = tag_data["name"]

        # 同名タグがユーザー内に既に存在する場合はスキップ
        existing_by_name = db.execute(
            select(Tag).where(Tag.user_id == current_user.id, Tag.name == tag_name)
        ).scalar_one_or_none()
        if existing_by_name is not None:
            if orig_id is not None:
                tag_id_map[orig_id] = existing_by_name.id
            skipped_tags += 1
            continue

        # ID が指定されていて既存レコードがあればスキップ
        if orig_id is not None:
            existing_by_id = db.execute(
                select(Tag).where(Tag.id == orig_id)
            ).scalar_one_or_none()
            if existing_by_id is not None:
                tag_id_map[orig_id] = existing_by_id.id
                skipped_tags += 1
                continue

        new_tag = Tag(
            user_id=current_user.id,
            name=tag_name,
        )
        db.add(new_tag)
        db.flush()

        if orig_id is not None:
            tag_id_map[orig_id] = new_tag.id
        imported_tags += 1

    # --- NameCards のインポート ---
    for nc_data in payload.get("namecards", []):
        orig_id = nc_data.get("id")

        # ID が指定されていて既存レコードがあればスキップ
        if orig_id is not None:
            existing = db.execute(
                select(NameCard).where(NameCard.id == orig_id)
            ).scalar_one_or_none()
            if existing is not None:
                skipped_namecards += 1
                continue

        # NameCard 作成
        nc = NameCard(
            user_id=current_user.id,
            first_name=nc_data.get("first_name", ""),
            last_name=nc_data.get("last_name", ""),
            first_name_kana=nc_data.get("first_name_kana"),
            last_name_kana=nc_data.get("last_name_kana"),
            image_path=nc_data.get("image_path"),
            met_notes=nc_data.get("met_notes"),
            notes=nc_data.get("notes"),
        )
        db.add(nc)
        db.flush()

        # ContactMethod 作成
        for cm_data in nc_data.get("contact_methods", []):
            cm = ContactMethod(
                name_card_id=nc.id,
                type=cm_data["type"],
                label=cm_data.get("label", ""),
                value=cm_data["value"],
                is_primary=cm_data.get("is_primary", False),
            )
            db.add(cm)

        # Relationship 関連付け
        for rel_id in nc_data.get("relationship_ids", []):
            mapped_rel_id = rel_id_map.get(rel_id, rel_id)
            rel = db.execute(
                select(Relationship).where(Relationship.id == mapped_rel_id)
            ).scalar_one_or_none()
            if rel is not None:
                nc.relationships.append(rel)

        # Tag 関連付け
        for tag_id in nc_data.get("tag_ids", []):
            mapped_tag_id = tag_id_map.get(tag_id, tag_id)
            tag = db.execute(
                select(Tag).where(Tag.id == mapped_tag_id)
            ).scalar_one_or_none()
            if tag is not None:
                nc.tags.append(tag)

        db.flush()
        imported_namecards += 1

    db.flush()

    return {
        "imported": {
            "relationships": imported_relationships,
            "tags": imported_tags,
            "namecards": imported_namecards,
        },
        "skipped": {
            "relationships": skipped_relationships,
            "tags": skipped_tags,
            "namecards": skipped_namecards,
        },
    }
