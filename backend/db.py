from contextlib import contextmanager
from sqlalchemy import create_engine, ForeignKey
from sqlalchemy.orm import (
    sessionmaker,
    DeclarativeBase,
    Mapped,
    mapped_column,
    Session,
    relationship,
)
from sqlalchemy.types import Integer, String, DateTime, Text
from sqlalchemy.sql import func
import os
from typing import Generator, Any


# ============================================================
# 1. Baseクラスの定義（モジュールレベルで定義する）
# ============================================================
class Base(DeclarativeBase):
    """全モデルの基底クラス"""

    pass


# ============================================================
# 2. モデル定義（SQLAlchemy 2.0スタイル）
# ============================================================
class Relationship(Base):
    """関係性モデル（組織階層）"""

    __tablename__ = "relationship"

    # 主キー
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 関係性の名称（例："経済団体A", "東京支部", "渋谷班"）
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # 親関係性への外部キー（自己参照）
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("relationship.id"),  # 自分のテーブルを参照
        nullable=True,
    )

    # 親子関係の定義（自己参照）
    parent: Mapped["Relationship | None"] = relationship(
        "Relationship",
        remote_side=[id],  # 親側はidカラム
        back_populates="children",  # 子側からの逆参照名
    )
    children: Mapped[list["Relationship"]] = relationship(
        "Relationship",
        back_populates="parent",  # 親側からの逆参照名
    )

    # この組織に所属する名刺一覧
    namecards: Mapped[list["NameCard"]] = relationship(
        "NameCard",
        back_populates="relationship",  # NameCard側からの逆参照
    )

    def __repr__(self) -> str:
        return f"<Relationship(id={self.id}, name={self.name})>"


class NameCard(Base):
    """名刺モデル"""

    __tablename__ = "namecards"

    # 主キー：UUIDではなく自動採番の整数IDが一般的
    # UUIDが必要な場合は from sqlalchemy import UUID を使う
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 名刺情報
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name_kana: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name_kana: Mapped[str] = mapped_column(String(100), nullable=False)

    # 連絡先情報（必要に応じて追加）
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # 組織・関係性への外部キー
    relationship_id: Mapped[int | None] = mapped_column(
        ForeignKey("relationship.id"),  # relationshipテーブルを参照
        nullable=True,
    )
    relationship: Mapped["Relationship | None"] = relationship(
        "Relationship",
        back_populates="namecards",  # Relationship側からの逆参照
    )

    # 備考（文字数無制限）
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # タイムスタンプ（自動設定）
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<NameCard(id={self.id}, name={self.full_name()})>"

    def full_name(self) -> str:
        """フルネームを返す"""
        return f"{self.last_name} {self.first_name}"


# ============================================================
# 3. エンジン・セッション管理
# ============================================================
# グローバル変数（初期化後に設定される）
_engine = None
_SessionLocal = None


def init_db(database_url: str | None = None) -> None:
    """
    データベースを初期化する

    Args:
        database_url: データベースURL。未指定の場合は環境変数 DATABASE_URL を使用

    Raises:
        ValueError: DATABASE_URL が設定されていない場合
    """
    global _engine, _SessionLocal

    if database_url is None:
        database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        raise ValueError(
            "Database URL is required. "
            "Set DATABASE_URL environment variable or pass database_url parameter."
        )

    # エンジン作成（必要に応じてecho=TrueでSQLログを出力）
    _engine = create_engine(
        database_url,
        echo=False,  # 開発時はTrueにするとSQLが見える
        pool_pre_ping=True,  # 接続の健全性チェック
    )

    # セッションファクトリ作成
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

    # テーブル作成（存在しない場合のみ）
    Base.metadata.create_all(bind=_engine)


def get_engine():
    """初期化済みエンジンを取得"""
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _engine


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """
    データベースセッションを取得する（コンテキストマネージャ対応）

    Usage:
        with get_session() as session:
            cards = session.query(NameCard).all()

    Yields:
        Session: SQLAlchemyセッション
    """
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")

    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def get_db() -> Generator[Session, None, None]:
    """
    FastAPIのDependency Injection用

    Usage (FastAPI):
        @app.get("/namecards")
        def read_namecards(db: Session = Depends(get_db)):
            return db.query(NameCard).all()
    """
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")

    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# 4. 便利なCRUD操作（オプション）
# ============================================================
class NameCardRepository:
    """名刺のCRUD操作を提供するリポジトリクラス"""

    @staticmethod
    def create(session, first_name: str, last_name: str, **kwargs) -> NameCard:
        """名刺を作成"""
        card = NameCard(first_name=first_name, last_name=last_name, **kwargs)
        session.add(card)
        session.flush()  # IDを取得するためにflush
        return card

    @staticmethod
    def get_by_id(session, card_id: int) -> NameCard | None:
        """IDで名刺を取得"""
        return session.get(NameCard, card_id)

    @staticmethod
    def get_all(session, skip: int = 0, limit: int = 100) -> list[NameCard]:
        """名刺一覧を取得（ページネーション対応）"""
        return session.query(NameCard).offset(skip).limit(limit).all()

    @staticmethod
    def search_by_name(session, query: str) -> list[NameCard]:
        """名前で検索"""
        return (
            session.query(NameCard)
            .filter(
                (NameCard.first_name.contains(query))
                | (NameCard.last_name.contains(query))
            )
            .all()
        )

    @staticmethod
    def delete(session, card: NameCard) -> None:
        """名刺を削除"""
        session.delete(card)


class RelationshipRepository:
    """組織階層（Relationship）のCRUD操作を提供するリポジトリクラス"""

    @staticmethod
    def create(session, name: str, parent_id: int | None = None) -> Relationship:
        """組織を作成（親指定で階層作成）"""
        rel = Relationship(name=name, parent_id=parent_id)
        session.add(rel)
        session.flush()
        return rel

    @staticmethod
    def get_by_id(session, rel_id: int) -> Relationship | None:
        """IDで組織を取得"""
        return session.get(Relationship, rel_id)

    @staticmethod
    def get_roots(session) -> list[Relationship]:
        """最上位（親を持たない）組織一覧を取得"""
        return (
            session.query(Relationship).filter(Relationship.parent_id.is_(None)).all()
        )

    @staticmethod
    def get_all_descendants(session, rel_id: int) -> list[Relationship]:
        """指定組織の全子孫を取得（再帰的）"""
        rel = session.get(Relationship, rel_id)
        if not rel:
            return []

        result = []
        queue = list(rel.children)
        while queue:
            current = queue.pop(0)
            result.append(current)
            queue.extend(current.children)
        return result

    @staticmethod
    def get_ancestors(session, rel_id: int) -> list[Relationship]:
        """指定組織の全祖先を取得（親→親の親の順）"""
        rel = session.get(Relationship, rel_id)
        if not rel:
            return []

        result = []
        current = rel.parent
        while current:
            result.append(current)
            current = current.parent
        return result

    @staticmethod
    def get_tree(session, rel_id: int) -> dict[str, Any]:
        """ツリー構造を辞書で取得（JSONシリアライズ可能）"""
        rel = session.get(Relationship, rel_id)
        if not rel:
            return {}

        def build_tree(node: Relationship) -> dict[str, Any]:
            return {
                "id": node.id,
                "name": node.name,
                "children": [build_tree(child) for child in node.children],
            }

        return build_tree(rel)

    @staticmethod
    def get_namecards_in_hierarchy(
        session, rel_id: int, include_descendants: bool = True
    ) -> list[NameCard]:
        """指定組織（と子孫）に所属する名刺一覧を取得"""
        rel_ids = [rel_id]

        if include_descendants:
            descendants = RelationshipRepository.get_all_descendants(session, rel_id)
            rel_ids.extend([d.id for d in descendants])

        return (
            session.query(NameCard).filter(NameCard.relationship_id.in_(rel_ids)).all()
        )

    @staticmethod
    def delete(session, rel: Relationship) -> None:
        """組織を削除（子がある場合は削除不可）"""
        if rel.children:
            raise ValueError(
                f"Cannot delete '{rel.name}': has {len(rel.children)} children"
            )
        session.delete(rel)
