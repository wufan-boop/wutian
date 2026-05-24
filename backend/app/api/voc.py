from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from ..core.deps import get_current_user
from ..models.user import User
from ..services.voc_service import analyze_voc

router = APIRouter(prefix="/api/voc", tags=["voc"])


class VOCRequest(BaseModel):
    asin: str
    competitor_asins: List[str] = []
    site: str = "US"
    data_source: str = "sorftime"
    analysis_mode: str = "single"
    ai_model: str = "gemini"


@router.post("/analyze")
async def voc_analyze(
    body: VOCRequest,
    current_user: User = Depends(get_current_user),
):
    async def stream():
        async for chunk in analyze_voc(
            asin=body.asin,
            competitor_asins=body.competitor_asins,
            site=body.site,
            ai_model=body.ai_model,
        ):
            yield chunk

    return StreamingResponse(stream(), media_type="text/event-stream")
