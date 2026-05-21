from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.prompt import Prompt
from ..models.user import User
from ..services.product_service import DEFAULT_SYSTEM_INSTRUCTION as PRODUCT_DEFAULT
from ..services.listing_service import DEFAULT_SYSTEM_INSTRUCTION as LISTING_DEFAULT

router = APIRouter(prefix="/api/prompts", tags=["prompts"])

DEFAULTS = {
    "product_research": PRODUCT_DEFAULT,
    "listing": LISTING_DEFAULT,
}


class PromptItem(BaseModel):
    name: str
    content: str


class PromptUpdate(BaseModel):
    content: str


def _get_or_default(name: str, db: Session) -> str:
    row = db.query(Prompt).filter(Prompt.name == name).first()
    return row.content if row else DEFAULTS.get(name, "")


@router.get("", response_model=List[PromptItem])
def list_prompts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return [{"name": name, "content": _get_or_default(name, db)} for name in DEFAULTS]


@router.put("/{name}", response_model=PromptItem)
def update_prompt(
    name: str,
    body: PromptUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if name not in DEFAULTS:
        raise HTTPException(status_code=404, detail="Unknown prompt name")
    row = db.query(Prompt).filter(Prompt.name == name).first()
    if row:
        row.content = body.content
    else:
        row = Prompt(name=name, content=body.content)
        db.add(row)
    db.commit()
    return {"name": name, "content": row.content}
