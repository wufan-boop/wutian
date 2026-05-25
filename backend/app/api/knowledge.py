from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, DateTime
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from ..core.database import Base, get_db
from ..api.auth import get_current_user

# Model
class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, index=True)
    title = Column(String)
    content = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Schemas
class KBCreate(BaseModel):
    category: str
    title: str
    content: str

class KBUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None

class KBOut(BaseModel):
    id: int
    category: str
    title: str
    content: str
    updated_at: datetime
    class Config:
        from_attributes = True

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

@router.get("", response_model=List[KBOut])
def list_items(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(KnowledgeItem).order_by(KnowledgeItem.updated_at.desc()).all()

@router.post("", response_model=KBOut)
def create_item(data: KBCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = KnowledgeItem(**data.dict())
    db.add(item); db.commit(); db.refresh(item)
    return item

@router.put("/{item_id}", response_model=KBOut)
def update_item(item_id: int, data: KBUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.dict(exclude_none=True).items():
        setattr(item, k, v)
    item.updated_at = datetime.utcnow()
    db.commit(); db.refresh(item)
    return item

@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(KnowledgeItem).filter(KnowledgeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item); db.commit()
    return {"ok": True}
