from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from api.deps import get_db
from services.namecard_service import NameCardService
from models.schemas import NameCardCreate, NameCardResponse

router = APIRouter()


@router.get("/", response_model=List[NameCardResponse])
def list_namecards(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """名刺一覧を取得"""
    service = NameCardService(db)
    return service.get_all(skip=skip, limit=limit)


@router.post("/", response_model=NameCardResponse)
def create_namecard(card_data: NameCardCreate, db: Session = Depends(get_db)):
    """名刺を作成"""
    service = NameCardService(db)
    return service.create(card_data)


@router.get("/{card_id}", response_model=NameCardResponse)
def get_namecard(card_id: int, db: Session = Depends(get_db)):
    """名刺詳細を取得"""
    service = NameCardService(db)
    card = service.get_by_id(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="名刺が見つかりません")
    return card


@router.get("/search", response_model=List[NameCardResponse])
def search_namecards(
    q: str = Query(..., min_length=1, description="検索キーワード"),
    db: Session = Depends(get_db),
):
    """名刺を検索"""
    service = NameCardService(db)
    return service.search(q)
