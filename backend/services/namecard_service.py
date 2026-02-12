from sqlalchemy.orm import Session
from db import NameCard, NameCardRepository


class NameCardService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = NameCardRepository()

    def get_all(self, skip: int = 0, limit: int = 100):
        """全名刺取得（ページネーション）"""
        return self.repo.get_all(self.db, skip=skip, limit=limit)

    def get_by_id(self, card_id: int):
        """IDで名刺取得"""
        return self.repo.get_by_id(self.db, card_id)

    def create(self, card_data):
        """名刺作成"""
        card = self.repo.create(
            self.db,
            first_name=card_data.first_name,
            last_name=card_data.last_name,
            first_name_kana=card_data.first_name_kana,
            last_name_kana=card_data.last_name_kana,
            email=card_data.email,
            phone=card_data.phone,
            company=card_data.company,
            department=card_data.department,
            position=card_data.position,
            relationship_id=card_data.relationship_id,
            notes=card_data.notes,
        )
        self.db.commit()
        self.db.refresh(card)
        return card

    def search(self, query: str):
        """名刺検索"""
        return self.repo.search_by_name(self.db, query)
