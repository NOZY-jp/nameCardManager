from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    select,
)
from sqlalchemy.orm import Mapped, Session, mapped_column
from sqlalchemy.orm import relationship as _relationship

from app.core.database import Base


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  User
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # リレーション
    name_cards: Mapped[list[NameCard]] = _relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    relationships: Mapped[list[Relationship]] = _relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="[Relationship.user_id]",
    )
    tags: Mapped[list[Tag]] = _relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Relationship（組織情報の階層構造）
#  例: 建築士会/桑名支部/青年会長, Jasca/三重/理事
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("relationships.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # リレーション
    user: Mapped[User] = _relationship(
        back_populates="relationships", foreign_keys=[user_id]
    )
    parent: Mapped[Relationship | None] = _relationship(
        back_populates="children",
        remote_side="Relationship.id",
        foreign_keys=[parent_id],
    )
    children: Mapped[list[Relationship]] = _relationship(
        back_populates="parent",
        foreign_keys=[parent_id],
    )
    name_cards: Mapped[list[NameCard]] = _relationship(
        secondary="name_card_relationships", back_populates="relationships"
    )

    def get_ancestors(self, db: Session) -> list[Relationship]:
        """子から親をさかのぼって全祖先を返す（近い順: 親→祖父→...）。

        再帰CTEで1クエリで取得する。
        """
        if self.parent_id is None:
            return []

        # アンカー: 直接の親
        anchor = (
            select(
                Relationship.id,
                Relationship.parent_id,
                Relationship.user_id,
                Relationship.name,
            )
            .where(Relationship.id == self.parent_id)
            .cte(name="ancestors", recursive=True)
        )

        # 再帰部: 親の親をたどる
        r_alias = Relationship.__table__
        recursive = select(
            r_alias.c.id,
            r_alias.c.parent_id,
            r_alias.c.user_id,
            r_alias.c.name,
        ).join(anchor, r_alias.c.id == anchor.c.parent_id)

        cte = anchor.union_all(recursive)

        stmt = select(Relationship).join(cte, Relationship.id == cte.c.id)
        rows = db.execute(stmt).scalars().all()

        # CTEの結果順序はDB依存のため、parent_idチェインで並べ替え
        by_id = {r.id: r for r in rows}
        ordered: list[Relationship] = []
        current_id = self.parent_id
        while current_id is not None and current_id in by_id:
            ordered.append(by_id[current_id])
            current_id = by_id[current_id].parent_id
        return ordered

    def get_full_path(self, db: Session) -> str:
        """祖先を遡って "建築士会/桑名支部/青年会長" 形式のフルパスを返す。"""
        ancestors = self.get_ancestors(db)
        parts = [a.name for a in reversed(ancestors)]
        parts.append(self.name)
        return "/".join(parts)

    def get_descendants(self, db: Session) -> list[Relationship]:
        """親（または途中）から全子孫を返す（深さ優先順）。

        再帰CTEで1クエリで取得し、パス情報で深さ優先ソートする。
        """
        # アンカー: 直接の子
        anchor = (
            select(
                Relationship.id,
                Relationship.parent_id,
                Relationship.user_id,
                Relationship.name,
            )
            .where(Relationship.parent_id == self.id)
            .cte(name="descendants", recursive=True)
        )

        # 再帰部: 子の子をたどる
        r_alias = Relationship.__table__
        recursive = select(
            r_alias.c.id,
            r_alias.c.parent_id,
            r_alias.c.user_id,
            r_alias.c.name,
        ).join(anchor, r_alias.c.parent_id == anchor.c.id)

        cte = anchor.union_all(recursive)

        stmt = select(Relationship).join(cte, Relationship.id == cte.c.id)
        rows = db.execute(stmt).scalars().all()

        # 深さ優先順にソート（parent_idベースのツリー走査）
        children_map: dict[int, list[Relationship]] = {}
        for r in rows:
            children_map.setdefault(r.parent_id, []).append(r)  # type: ignore[arg-type]

        ordered: list[Relationship] = []

        def _dfs(parent_id: int) -> None:
            for child in children_map.get(parent_id, []):
                ordered.append(child)
                _dfs(child.id)

        _dfs(self.id)
        return ordered


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tag（フラット分類ラベル: ゴルフ仲間、友人、取引先、重要）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # リレーション
    user: Mapped[User] = _relationship(back_populates="tags")
    name_cards: Mapped[list[NameCard]] = _relationship(
        secondary="name_card_tags", back_populates="tags"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NameCardRelationship（中間テーブル: 名刺 ↔ 組織の多対多）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class NameCardRelationship(Base):
    __tablename__ = "name_card_relationships"

    name_card_id: Mapped[int] = mapped_column(
        ForeignKey("name_cards.id"), primary_key=True
    )
    relationship_id: Mapped[int] = mapped_column(
        ForeignKey("relationships.id"), primary_key=True
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NameCardTag（中間テーブル: 名刺 ↔ タグの多対多）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class NameCardTag(Base):
    __tablename__ = "name_card_tags"

    name_card_id: Mapped[int] = mapped_column(
        ForeignKey("name_cards.id"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ContactMethod（連絡先: email, phone, fax, website 等）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class ContactMethod(Base):
    __tablename__ = "contact_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_card_id: Mapped[int] = mapped_column(
        ForeignKey("name_cards.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    # リレーション
    name_card: Mapped[NameCard] = _relationship(back_populates="contact_methods")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  NameCard（名刺）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class NameCard(Base):
    __tablename__ = "name_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name_kana: Mapped[str | None] = mapped_column(String(100))
    last_name_kana: Mapped[str | None] = mapped_column(String(100))
    company_name: Mapped[str | None] = mapped_column(String(200))
    department: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[str | None] = mapped_column(String(200))
    image_path: Mapped[str | None] = mapped_column(String(500))
    met_notes: Mapped[str | None] = mapped_column(Text, comment="どこで出会ったか")
    memo: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # リレーション
    user: Mapped[User] = _relationship(back_populates="name_cards")
    relationships: Mapped[list[Relationship]] = _relationship(
        secondary="name_card_relationships", back_populates="name_cards"
    )
    tags: Mapped[list[Tag]] = _relationship(
        secondary="name_card_tags", back_populates="name_cards"
    )
    contact_methods: Mapped[list[ContactMethod]] = _relationship(
        back_populates="name_card", cascade="all, delete-orphan"
    )


__all__ = [
    "User",
    "NameCard",
    "Relationship",
    "Tag",
    "NameCardTag",
    "NameCardRelationship",
    "ContactMethod",
]
