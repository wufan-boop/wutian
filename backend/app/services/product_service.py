import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, Any

from google import genai
from google.genai import types

from ..core.config import settings
from .sorftime_client import call_sorftime_tool

logger = logging.getLogger(__name__)

_client = genai.Client(api_key=settings.gemini_api_key)

_SYSTEM_INSTRUCTION = """你是亚马逊选品专家。根据提供的真实市场数据生成完整选品分析报告。
只返回严格JSON，不要其他文字：
{
  "market_overview": {"size": "描述（含月搜索量等具体数字）", "competition": "低/中/高", "avg_price": 平均价格数字},
  "competitors": [{"asin": "B0...", "title": "标题", "price": 价格, "rating": 评分, "monthly_sales": 月销量}],
  "analysis": {"opportunities": ["机会点"], "risks": ["风险点"], "recommendation": "综合建议"}
}"""


def _build_prompt(data: dict, market_data: Dict[str, Any]) -> str:
    site = data.get("site", "US")
    lines = []
    if data.get("category"):
        lines.append(f"类目：{data['category']}")
    if data.get("keyword"):
        lines.append(f"关键词：{data['keyword']}")
    if data.get("dimensions"):
        lines.append(f"分析维度：{', '.join(data['dimensions'])}")
    lines.append(f"目标站点：{site}")

    if market_data:
        lines.append("\n以下是从市场数据平台获取的真实数据，请基于这些数据进行分析：")
        lines.append(json.dumps(market_data, ensure_ascii=False, indent=2))

    lines.append("\n请生成完整的选品分析报告（JSON格式）。")
    return "\n".join(lines)


async def _fetch_market_data(data: dict) -> Dict[str, Any]:
    """Fetch real market data from Sorftime MCP concurrently."""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    site = data.get("site", "US")

    if not mcp_url or not api_key:
        return {}

    keyword = data.get("keyword") or ""
    category = data.get("category") or ""
    product_name = keyword or category

    market_data: Dict[str, Any] = {}

    tasks = []
    task_keys = []

    if keyword:
        tasks.append(call_sorftime_tool(
            "keyword_detail",
            {"keyword": keyword, "keywordSupportSite": site},
            mcp_url, api_key,
        ))
        task_keys.append("keyword_detail")

        tasks.append(call_sorftime_tool(
            "keyword_search_results",
            {"keyword": keyword, "keywordSupportSite": site},
            mcp_url, api_key,
        ))
        task_keys.append("keyword_search_results")

    if product_name:
        tasks.append(call_sorftime_tool(
            "similar_product_feature",
            {"productName": product_name, "amzSite": site},
            mcp_url, api_key,
        ))
        task_keys.append("similar_product_feature")

    if not tasks:
        return {}

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for key, result in zip(task_keys, results):
        if isinstance(result, Exception):
            logger.warning("Market data fetch failed for %s: %s", key, result)
        elif result:
            market_data[key] = result

    return market_data


async def research_product_stream(data: dict) -> AsyncGenerator[Dict[str, Any], None]:
    # Status: fetching market data
    yield {"type": "status", "content": "正在获取市场数据..."}

    try:
        market_data = await _fetch_market_data(data)
    except Exception as exc:
        logger.warning("_fetch_market_data failed: %s", exc)
        market_data = {}

    # Status: generating report
    yield {"type": "status", "content": "正在生成分析报告..."}

    prompt = _build_prompt(data, market_data)

    async for chunk in await _client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=_SYSTEM_INSTRUCTION),
    ):
        if chunk.text:
            yield {"type": "text", "content": chunk.text}
