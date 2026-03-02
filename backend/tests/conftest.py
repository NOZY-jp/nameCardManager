"""テスト共通フィクスチャ。

全テストで使う DB セッション、TestClient、認証ヘッダー、
サンプルデータ（Relationship ツリー、Tag、NameCard）を提供する。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_password_hash
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.main import app
from app.models import ContactMethod, NameCard, Relationship, Tag, User


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DB session（トランザクションロールバック方式）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@pytest.fixture()
def db_session():
    """テストごとにトランザクションをロールバックする DB セッション。

    1. テスト用 Engine でテーブルを作成
    2. コネクション → トランザクション → Session
    3. yield 後にロールバック＆クローズ
    """
    settings = get_settings()
    engine = create_engine(settings.database_url)
    Base.metadata.create_all(bind=engine)

    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TestClient（DB 依存性をオーバーライド）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@pytest.fixture()
def client(db_session: Session):
    """FastAPI TestClient。get_db を db_session に差し替える。"""

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ユーザー＆認証
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _create_user_and_token(
    db_session: Session,
    email: str,
    password: str,
) -> tuple[dict, str]:
    """ユーザーを DB に直接作成し、JWT トークンを発行する。

    Returns:
        (user_dict, access_token)
    """
    user = User(email=email, password_hash=get_password_hash(password))
    db_session.add(user)
    db_session.flush()

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
    )
    user_dict = {"id": user.id, "email": user.email}
    return user_dict, access_token


@pytest.fixture()
def user_and_token(db_session: Session):
    """テストユーザーを作成し (user_dict, access_token) を返す。"""
    return _create_user_and_token(
        db_session, email="test@example.com", password="testpass123"
    )


@pytest.fixture()
def auth_headers(user_and_token: tuple[dict, str]):
    """テストユーザーの認証ヘッダーを返す。"""
    _, token = user_and_token
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def other_user_and_token(db_session: Session):
    """別ユーザー（権限テスト用）を作成し (user_dict, access_token) を返す。"""
    return _create_user_and_token(
        db_session, email="other@example.com", password="otherpass123"
    )


@pytest.fixture()
def other_auth_headers(other_user_and_token: tuple[dict, str]):
    """別ユーザーの認証ヘッダーを返す。"""
    _, token = other_user_and_token
    return {"Authorization": f"Bearer {token}"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  サンプルデータ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@pytest.fixture()
def sample_relationship_tree(
    db_session: Session, user_and_token: tuple[dict, str]
) -> list[dict]:
    """3 階層の Relationship ツリーを作成する。

    建築士会 → 桑名支部 → 青年会長

    Returns:
        [{"id": ..., "name": ...}, ...] (ルートから末端の順)
    """
    user_dict, _ = user_and_token

    r1 = Relationship(user_id=user_dict["id"], name="建築士会", parent_id=None)
    db_session.add(r1)
    db_session.flush()

    r2 = Relationship(user_id=user_dict["id"], name="桑名支部", parent_id=r1.id)
    db_session.add(r2)
    db_session.flush()

    r3 = Relationship(user_id=user_dict["id"], name="青年会長", parent_id=r2.id)
    db_session.add(r3)
    db_session.flush()

    return [
        {"id": r1.id, "name": r1.name},
        {"id": r2.id, "name": r2.name},
        {"id": r3.id, "name": r3.name},
    ]


@pytest.fixture()
def sample_tags(db_session: Session, user_and_token: tuple[dict, str]) -> list[dict]:
    """3 つのタグを作成する: 取引先, 友人, ゴルフ仲間。

    Returns:
        [{"id": ..., "name": ...}, ...]
    """
    user_dict, _ = user_and_token
    tags: list[dict] = []
    for name in ["取引先", "友人", "ゴルフ仲間"]:
        tag = Tag(user_id=user_dict["id"], name=name)
        db_session.add(tag)
        db_session.flush()
        tags.append({"id": tag.id, "name": tag.name})
    return tags


@pytest.fixture()
def sample_namecard(
    db_session: Session,
    user_and_token: tuple[dict, str],
    sample_relationship_tree: list[dict],
    sample_tags: list[dict],
) -> dict:
    """名刺 1 件を作成する（contact_methods, relationships, tags 全関連付き）。

    Returns:
        名刺情報の dict（id, first_name, last_name, ... を含む）
    """
    user_dict, _ = user_and_token

    # NameCard 作成
    namecard = NameCard(
        user_id=user_dict["id"],
        first_name="太郎",
        last_name="田中",
        first_name_kana="たろう",
        last_name_kana="たなか",
        met_notes="2025年展示会で出会った",
        memo="重要な取引先",
    )
    db_session.add(namecard)
    db_session.flush()

    # ContactMethod 追加
    cm1 = ContactMethod(
        name_card_id=namecard.id,
        type="email",
        label="仕事用",
        value="tanaka@example.com",
        is_primary=True,
    )
    cm2 = ContactMethod(
        name_card_id=namecard.id,
        type="mobile",
        label="携帯",
        value="090-1234-5678",
        is_primary=False,
    )
    db_session.add_all([cm1, cm2])
    db_session.flush()

    # Relationship 関連付け（末端ノード: 青年会長）
    leaf_rel = db_session.get(Relationship, sample_relationship_tree[2]["id"])
    if leaf_rel is not None:
        namecard.relationships.append(leaf_rel)

    # Tag 関連付け（取引先）
    first_tag = db_session.get(Tag, sample_tags[0]["id"])
    if first_tag is not None:
        namecard.tags.append(first_tag)

    db_session.flush()

    return {
        "id": namecard.id,
        "user_id": namecard.user_id,
        "first_name": namecard.first_name,
        "last_name": namecard.last_name,
        "first_name_kana": namecard.first_name_kana,
        "last_name_kana": namecard.last_name_kana,
        "met_notes": namecard.met_notes,
        "memo": namecard.memo,
        "contact_methods": [
            {
                "id": cm1.id,
                "type": cm1.type,
                "label": cm1.label,
                "value": cm1.value,
                "is_primary": cm1.is_primary,
            },
            {
                "id": cm2.id,
                "type": cm2.type,
                "label": cm2.label,
                "value": cm2.value,
                "is_primary": cm2.is_primary,
            },
        ],
        "relationship_ids": [sample_relationship_tree[2]["id"]],
        "tag_ids": [sample_tags[0]["id"]],
    }
