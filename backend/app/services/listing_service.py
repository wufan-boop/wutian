from typing import AsyncGenerator

import anthropic

_async_client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """你是亚马逊运营专家，专门生成高质量的亚马逊产品Listing。
根据用户提供的产品信息，生成符合亚马逊SEO要求的Listing。
只返回严格的JSON，不要有其他文字：
{
  "title": "产品标题（不超过200字符）",
  "bullet_points": ["卖点1","卖点2","卖点3","卖点4","卖点5"],
  "description": "产品描述（200-2000字符）",
  "search_terms": ["关键词1","关键词2","关键词3","关键词4","关键词5"]
}"""


def _build_prompt(data: dict) -> str:
    lines = [f"产品名称：{data['product_name']}"]
    if data.get("features"):
        lines.append(f"产品特卖点：{data['features']}")
    lines.append(f"目标市场：{data.get('market', 'US')}")
    if data.get("asins"):
        lines.append(f"参考竞品ASIN：{', '.join(data['asins'])}")
    if data.get("keywords"):
        lines.append(f"目标关键词：{data['keywords']}")
    return "\n".join(lines)


async def generate_listing_stream(data: dict) -> AsyncGenerator[str, None]:
    prompt = _build_prompt(data)
    async with _async_client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
