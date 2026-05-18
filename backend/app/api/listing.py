import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.listing_history import ListingHistory
from ..models.user import User
from ..services import listing_service

router = APIRouter(prefix="/api/listing", tags=["listing"])


class ListingRequest(BaseModel):
    product_name: str
    features: Optional[str] = None
    market: str = "US"
    asins: Optional[List[str]] = None
    keywords: Optional[str] = None


class HistoryItem(BaseModel):
    id: int
    product_name: str
    market: str
    result_json: Optional[str]
    created_at: str


@router.post("/generate")
async def generate_listing(
    body: ListingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collected: List[str] = []

    async def event_stream():
        async for chunk in listing_service.generate_listing_stream(body.model_dump()):
            collected.append(chunk)
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        full_text = "".join(collected)
        try:
            record = ListingHistory(
                user_id=current_user.id,
                product_name=body.product_name,
                market=body.market,
                input_json=body.model_dump_json(),
                result_json=full_text,
            )
            db.add(record)
            db.commit()
            yield f"data: {json.dumps({'done': True, 'id': record.id})}\n\n"
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
        db.query(ListingHistory)
        .filter(ListingHistory.user_id == current_user.id)
        .order_by(ListingHistory.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        HistoryItem(
            id=r.id,
            product_name=r.product_name,
            market=r.market,
            result_json=r.result_json,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]
