import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.product_history import ProductHistory
from ..models.prompt import Prompt
from ..models.user import User
from ..services import product_service

router = APIRouter(prefix="/api/product", tags=["product"])


class ProductRequest(BaseModel):
    keyword: Optional[str] = None
    category: Optional[str] = None
    dimensions: Optional[List[str]] = None
    selling_price: Optional[float] = None
    fba_fee: Optional[float] = None
    cogs: Optional[float] = None
    site: str = "US"


class HistoryItem(BaseModel):
    id: int
    keyword: str
    selling_price: Optional[float]
    fba_fee: Optional[float]
    cogs: Optional[float]
    profit_margin: Optional[float]
    result_json: Optional[str]
    created_at: str


def _calc_margin(selling_price, fba_fee, cogs) -> Optional[float]:
    if selling_price is not None and selling_price > 0:
        profit = selling_price - (fba_fee or 0) - (cogs or 0)
        return round(profit / selling_price * 100, 2)
    return None


@router.post("/research")
async def research_product(
    body: ProductRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prompt_row = db.query(Prompt).filter(Prompt.name == "product_research").first()
    system_instruction = prompt_row.content if prompt_row else product_service.DEFAULT_SYSTEM_INSTRUCTION

    collected: List[str] = []

    async def event_stream():
        async for event in product_service.research_product_stream(body.model_dump(), system_instruction):
            if event.get("type") == "text":
                content = event["content"]
                collected.append(content)
                yield f"data: {json.dumps({'text': content}, ensure_ascii=False)}\n\n"
            elif event.get("type") == "status":
                yield f"data: {json.dumps({'status': event['content']}, ensure_ascii=False)}\n\n"

        full_text = "".join(collected)
        margin = _calc_margin(body.selling_price, body.fba_fee, body.cogs)
        try:
            record = ProductHistory(
                user_id=current_user.id,
                keyword=body.keyword or body.category or "",
                input_json=body.model_dump_json(),
                result_json=full_text,
                selling_price=body.selling_price,
                fba_fee=body.fba_fee,
                cogs=body.cogs,
                profit_margin=margin,
            )
            db.add(record)
            db.commit()
            yield f"data: {json.dumps({'done': True, 'id': record.id, 'profit_margin': margin})}\n\n"
        except Exception:
            db.rollback()
            yield f"data: {json.dumps({'error': '保存历史记录失败'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history", response_model=List[HistoryItem])
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(ProductHistory)
        .filter(ProductHistory.user_id == current_user.id)
        .order_by(ProductHistory.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        HistoryItem(
            id=r.id,
            keyword=r.keyword,
            selling_price=r.selling_price,
            fba_fee=r.fba_fee,
            cogs=r.cogs,
            profit_margin=r.profit_margin,
            result_json=r.result_json,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]
