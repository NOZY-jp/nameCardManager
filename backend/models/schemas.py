from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class NameCardBase(BaseModel):
    first_name: str
    last_name: str
    first_name_kana: str
    last_name_kana: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    relationship_id: Optional[int] = None
    notes: Optional[str] = None


class NameCardCreate(NameCardBase):
    pass


class NameCardResponse(NameCardBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
