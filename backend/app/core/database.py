from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """全モデルの基底クラス。"""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """SQLAlchemy Engine を返す（LRU cache でシングルトン）。"""
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


@lru_cache(maxsize=1)
def get_session_local() -> sessionmaker[Session]:
    """sessionmaker を返す（LRU cache でシングルトン）。"""
    return sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)


def get_db() -> Generator[Session]:
    """FastAPI Depends 用のセッションジェネレーター。

    Usage::

        @router.get("/items")
        def list_items(db: Session = Depends(get_db)): ...
    """
    db = get_session_local()()
    try:
        yield db
        db.commit()  # 正常終了時にコミット
    except Exception:
        db.rollback()  # エラー時にロールバック
        raise
    finally:
        db.close()
