from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from ..api.auth import get_current_user
from ..services.listing_optimizer_service import run_optimizer

router = APIRouter(prefix="/api/listing-optimizer", tags=["listing-optimizer"])

class OptimizerInput(BaseModel):
    asin: Optional[str] = ""
    competitor_asins: List[str] = []
    site: str = "US"
    existing_title: Optional[str] = ""
    existing_bullets: Optional[str] = ""
    ai_model: str = "deepseek"
    mode: str = "diagnose"  # diagnose | optimize

@router.post("/run")
async def run(body: OptimizerInput, _=Depends(get_current_user)):
    return StreamingResponse(
        run_optimizer(
            asin=body.asin,
            competitor_asins=body.competitor_asins,
            site=body.site,
            existing_title=body.existing_title,
            existing_bullets=body.existing_bullets,
            ai_model=body.ai_model,
            mode=body.mode,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
