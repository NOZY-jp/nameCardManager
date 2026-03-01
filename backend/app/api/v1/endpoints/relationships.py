"""Relationship endpoints – 組織階層の CRUD & ツリー取得。

エンドポイント:
- GET    /relationships       – ルートノード一覧（ページネーションなし）
- GET    /relationships/tree  – ネスト構造のツリー
- POST   /relationships       – ノード作成
- GET    /relationships/{id}  – ノード詳細取得
- PATCH  /relationships/{id}  – ノード更新
- DELETE /relationships/{id}  – リーフノード削除
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import AuthUser, DbSession
from app.models import Relationship
from app.schemas import RelationshipCreate, RelationshipUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ヘルパー
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _to_response(rel: Relationship, db: DbSession) -> dict:
    """Relationship モデルをレスポンス dict に変換する。"""
    now = datetime.now(UTC)
    return {
        "id": rel.id,
        "name": rel.name,
        "parent_id": rel.parent_id,
        "full_path": rel.get_full_path(db),
        "created_at": now,
        "updated_at": now,
    }


def _build_tree(
    nodes: list[Relationship],
    db: DbSession,
) -> list[dict]:
    """フラットなノードリストからネストされたツリーを構築する。"""
    by_id: dict[int, dict] = {}
    now = datetime.now(UTC)

    for node in nodes:
        by_id[node.id] = {
            "id": node.id,
            "name": node.name,
            "parent_id": node.parent_id,
            "full_path": node.get_full_path(db),
            "children": [],
            "created_at": now,
            "updated_at": now,
        }

    roots: list[dict] = []
    for node in nodes:
        entry = by_id[node.id]
        if node.parent_id is not None and node.parent_id in by_id:
            by_id[node.parent_id]["children"].append(entry)
        else:
            roots.append(entry)

    return roots


def _is_descendant(
    db: DbSession,
    node_id: int,
    potential_ancestor_id: int,
    user_id: int,
) -> bool:
    """potential_ancestor_id が node_id の子孫かどうかを判定する。

    node_id から子孫をたどり、potential_ancestor_id が含まれていれば True。
    """
    node = db.execute(
        select(Relationship).where(
            Relationship.id == node_id,
            Relationship.user_id == user_id,
        )
    ).scalar_one_or_none()
    if node is None:
        return False

    descendants = node.get_descendants(db)
    return any(d.id == potential_ancestor_id for d in descendants)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /relationships – ルートノード一覧
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get("")
def list_relationships(
    db: DbSession,
    current_user: AuthUser,
) -> list[dict]:
    """ルートノード一覧を取得する（ページネーションなし）。"""
    roots = (
        db.execute(
            select(Relationship).where(
                Relationship.user_id == current_user.id,
                Relationship.parent_id.is_(None),
            )
        )
        .scalars()
        .all()
    )
    return [_to_response(r, db) for r in roots]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /relationships/tree – ツリー形式
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get("/tree")
def get_relationship_tree(
    db: DbSession,
    current_user: AuthUser,
) -> list[dict]:
    """ネストされたツリー構造を取得する。"""
    all_nodes = (
        db.execute(
            select(Relationship).where(
                Relationship.user_id == current_user.id,
            )
        )
        .scalars()
        .all()
    )
    return _build_tree(all_nodes, db)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /relationships – ノード作成
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.post("", status_code=status.HTTP_201_CREATED)
def create_relationship(
    body: RelationshipCreate,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """組織階層ノードを作成する。"""
    # name が空文字の場合は 422
    if not body.name or not body.name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name must not be empty",
        )

    # parent_id の検証
    if body.parent_id is not None:
        parent = db.execute(
            select(Relationship).where(
                Relationship.id == body.parent_id,
                Relationship.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent_id",
            )

    rel = Relationship(
        user_id=current_user.id,
        name=body.name,
        parent_id=body.parent_id,
    )
    db.add(rel)
    db.flush()

    return _to_response(rel, db)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /relationships/{id} – ノード詳細
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get("/{relationship_id}")
def get_relationship(
    relationship_id: int,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """組織階層ノードの詳細を取得する。"""
    rel = db.execute(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if rel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relationship not found",
        )

    return _to_response(rel, db)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /relationships/{id} – ノード更新
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.patch("/{relationship_id}")
def update_relationship(
    relationship_id: int,
    body: RelationshipUpdate,
    db: DbSession,
    current_user: AuthUser,
) -> dict:
    """組織階層ノードを更新する。"""
    rel = db.execute(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if rel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relationship not found",
        )

    # parent_id の更新がある場合
    if "parent_id" in body.model_fields_set:
        new_parent_id = body.parent_id

        if new_parent_id is not None:
            # 自分自身を親にできない
            if new_parent_id == relationship_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Circular reference detected",
                )

            # 子孫を親にできない（循環参照防止）
            if _is_descendant(db, relationship_id, new_parent_id, current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Circular reference detected",
                )

            # 新しい親が存在し、自ユーザーのものか確認
            parent = db.execute(
                select(Relationship).where(
                    Relationship.id == new_parent_id,
                    Relationship.user_id == current_user.id,
                )
            ).scalar_one_or_none()
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid parent_id",
                )

        rel.parent_id = new_parent_id

    if body.name is not None:
        rel.name = body.name

    db.flush()

    return _to_response(rel, db)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /relationships/{id} – リーフノード削除
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_relationship(
    relationship_id: int,
    db: DbSession,
    current_user: AuthUser,
) -> None:
    """組織階層ノードを削除する（リーフノードのみ）。"""
    rel = db.execute(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if rel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relationship not found",
        )

    # 子ノードがある場合は削除不可
    children = (
        db.execute(
            select(Relationship).where(
                Relationship.parent_id == relationship_id,
            )
        )
        .scalars()
        .all()
    )
    if children:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete node with children",
        )

    db.delete(rel)
    db.flush()
