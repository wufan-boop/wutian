from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from ..core.deps import get_current_user
from ..models.user import User
from ..services.listing_creator_service import analyze_listing_data, generate_listing_copy, generate_image_strategy

router = APIRouter(prefix="/api/listing", tags=["listing_creator"])


class AnalyzeRequest(BaseModel):
    asin: Optional[str] = ""
    competitor_asins: List[str] = []
    core_keywords: Optional[str] = ""
    product_name: Optional[str] = ""
    product_description: Optional[str] = ""
    differentiation: Optional[str] = ""
    site: str = "US"
    voc_data: Optional[str] = ""
    ai_model: str = "deepseek"


class GenerateRequest(BaseModel):
    input: dict
    analysis: Optional[dict] = None
    ai_model: str = "deepseek"


class ImageStrategyRequest(BaseModel):
    input: dict
    analysis: Optional[dict] = None
    listing: Optional[dict] = None
    ai_model: str = "deepseek"


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, current_user: User = Depends(get_current_user)):
    async def stream():
        async for chunk in analyze_listing_data(
            asin=body.asin,
            competitor_asins=body.competitor_asins,
            core_keywords=body.core_keywords,
            product_name=body.product_name,
            product_description=body.product_description,
            differentiation=body.differentiation,
            site=body.site,
            voc_data=body.voc_data,
            ai_model=body.ai_model,
        ):
            yield chunk
    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/generate")
async def generate(body: GenerateRequest, current_user: User = Depends(get_current_user)):
    async def stream():
        async for chunk in generate_listing_copy(body.input, body.analysis, body.ai_model):
            yield chunk
    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/image-strategy")
async def image_strategy(body: ImageStrategyRequest, current_user: User = Depends(get_current_user)):
    async def stream():
        async for chunk in generate_image_strategy(body.input, body.analysis, body.listing, body.ai_model):
            yield chunk
    return StreamingResponse(stream(), media_type="text/event-stream")
