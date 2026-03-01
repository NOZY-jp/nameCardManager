"""Tag CRUD エンドポイント。

GET    /api/v1/tags       – タグ一覧（ページネーションなし、配列形式）
POST   /api/v1/tags       – タグ作成
GET    /api/v1/tags/{id}  – タグ詳細取得
PATCH  /api/v1/tags/{id}  – タグ更新
DELETE /api/v1/tags/{id}  – タグ削除（中間テーブルのみ削除、紐づく名刺は削除しない）
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import AuthUser, DbSession
from app.models import Tag
from app.schemas import TagCreate, TagUpdate

router = APIRouter()


def _validate_tag_name(name: str) -> None:
    """タグ名が空文字でないことを検証する。"""
    if not name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tag name must not be empty",
        )


def _check_duplicate_tag(
    db: DbSession, user_id: int, name: str, *, exclude_id: int | None = None
) -> None:
    """同一ユーザー内でタグ名が重複していないことを検証する。"""
    stmt = select(Tag).where(Tag.user_id == user_id, Tag.name == name)
    if exclude_id is not None:
        stmt = stmt.where(Tag.id != exclude_id)
    existing = db.execute(stmt).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tag already exists",
        )


def _tag_to_dict(tag: Tag) -> dict:
    """Tag モデルをレスポンス用 dict に変換する。"""
    return {"id": tag.id, "name": tag.name}


# ─── GET /tags ────────────────────────────────────
@router.get("")
def list_tags(
    db: DbSession,
    current_user: AuthUser,
) -> list[dict]:
    """タグ一覧を取得する（ページネーションなし・配列形式）。"""
    stmt = select(Tag).where(Tag.user_id == current_user.id)
    tags = db.execute(stmt).scalars().all()
    return [_tag_to_dict(t) for t in tags]


# ─── POST /tags ───────────────────────────────────
@router.post("", status_code=status.HTTP_201_CREATED)
def create_tag(
    body: TagCreate,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """タグを作成する。"""
    _validate_tag_name(body.name)
    _check_duplicate_tag(db, current_user.id, body.name)

    tag = Tag(user_id=current_user.id, name=body.name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _tag_to_dict(tag)


# ─── GET /tags/{id} ──────────────────────────────
@router.get("/{tag_id}")
def get_tag(
    tag_id: int,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """タグ詳細を取得する。"""
    tag = db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id)
    ).scalar_one_or_none()

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    return _tag_to_dict(tag)


# ─── PATCH /tags/{id} ────────────────────────────
@router.patch("/{tag_id}")
def update_tag(
    tag_id: int,
    body: TagUpdate,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """タグ名を更新する。"""
    tag = db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id)
    ).scalar_one_or_none()

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )

    _validate_tag_name(body.name)
    _check_duplicate_tag(db, current_user.id, body.name, exclude_id=tag_id)

    tag.name = body.name
    db.commit()
    db.refresh(tag)
    return _tag_to_dict(tag)


# ─── DELETE /tags/{id} ───────────────────────────
@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: int,
    db: DbSession,
    current_user: AuthUser,
) -> None:
    """タグを削除する（中間テーブルのみ削除、紐づく名刺は削除しない）。"""
    tag = db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id)
    ).scalar_one_or_none()

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )

    db.delete(tag)
    db.commit()
