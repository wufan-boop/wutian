import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.user import User
from ..services import keyword_service

router = APIRouter(prefix="/api/keywords", tags=["keywords"])


# ─── 请求模型 ─────────────────────────────────────────────────────────────────

class KeywordBuildRequest(BaseModel):
    # 数据输入
    asins: Optional[List[str]] = None        # 竞品ASIN，最多5个
    keywords: Optional[List[str]] = None     # 核心关键词，最多3个
    listing_text: Optional[str] = None       # 自家Listing文本（解锁三色覆盖）
    site: str = "US"
    ai_model: Optional[str] = "deepseek"     # 分类用DeepSeek省成本


class KeywordExportRequest(BaseModel):
    project_id: str
    format: str = "csv"                      # csv / txt


# ─── 接口 ─────────────────────────────────────────────────────────────────────

@router.post("/build")
async def build_keyword_library(
    body: KeywordBuildRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """触发关键词采集+AI分类，流式返回状态和结果"""

    async def event_stream():
        async for event in keyword_service.build_keyword_library(
            user_id=current_user.id,
            asins=body.asins or [],
            keywords=body.keywords or [],
            listing_text=body.listing_text,
            site=body.site,
            ai_model=body.ai_model,
            db=db,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/projects")
def get_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取历史关键词项目列表"""
    projects = keyword_service.get_user_projects(current_user.id, db)
    return JSONResponse(content=projects)


@router.get("/project/{project_id}")
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取指定项目的关键词库结果"""
    result = keyword_service.get_project_result(project_id, current_user.id, db)
    if not result:
        return JSONResponse(content={"error": "项目不存在"}, status_code=404)
    return JSONResponse(content=result)


@router.get("/project/{project_id}/export")
def export_project(
    project_id: str,
    format: str = "csv",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导出关键词库（CSV格式）"""
    csv_content = keyword_service.export_to_csv(project_id, current_user.id, db)
    if not csv_content:
        return JSONResponse(content={"error": "项目不存在或无数据"}, status_code=404)

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=keywords_{project_id}.csv"}
    )
