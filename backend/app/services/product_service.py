from typing import AsyncGenerator

import anthropic

from ..core.config import settings

_async_client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """你是亚马逊选品专家。使用提供的MCP工具获取市场数据后，生成完整选品分析报告。
只返回严格JSON，不要其他文字：
{
  "market_overview": {"size": "市场规模描述", "competition": "低/中/高", "avg_price": 平均价格数字},
  "competitors": [{"asin": "B0...", "title": "标题", "price": 价格, "rating": 评分, "monthly_sales": 月销量}],
  "analysis": {"opportunities": ["机会点"], "risks": ["风险点"], "recommendation": "综合建议"}
}"""


def _build_prompt(data: dict) -> str:
    lines = []
    if data.get("category"):
        lines.append(f"类目：{data['category']}")
    if data.get("keyword"):
        lines.append(f"关键词：{data['keyword']}")
    if data.get("dimensions"):
        lines.append(f"分析维度：{', '.join(data['dimensions'])}")
    lines.append("请使用工具获取数据，然后生成完整的选品分析报告（JSON格式）。")
    return "\n".join(lines)


def _build_mcp_servers() -> list:
    servers = []
    if settings.sorftime_mcp_url:
        servers.append({
            "type": "url",
            "url": settings.sorftime_mcp_url,
            "name": "sorftime",
            "authorization_token": settings.sorftime_mcp_api_key,
        })
    if settings.maijia_mcp_url:
        servers.append({
            "type": "url",
            "url": settings.maijia_mcp_url,
            "name": "maijia",
            "authorization_token": settings.maijia_mcp_api_key,
        })
    return servers


async def research_product_stream(data: dict) -> AsyncGenerator[str, None]:
    prompt = _build_prompt(data)
    mcp_servers = _build_mcp_servers()

    kwargs: dict = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 4000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}],
        "betas": ["mcp-client-2025-04-04"],
    }
    if mcp_servers:
        kwargs["mcp_servers"] = mcp_servers

    async with _async_client.beta.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text
