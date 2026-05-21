from typing import AsyncGenerator

from google import genai
from google.genai import types

from ..core.config import settings

_client = genai.Client(api_key=settings.gemini_api_key)

DEFAULT_SYSTEM_INSTRUCTION = """你是亚马逊运营专家，专门生成高质量的亚马逊产品Listing。
根据用户提供的产品信息，生成符合亚马逊SEO要求的Listing，用中文直接输出可读文本，不要返回JSON。

输出格式：

## 标题
（不超过200字符的英文标题）

## 五点描述
- 卖点1
- 卖点2
- 卖点3
- 卖点4
- 卖点5

## 产品描述
（200-2000字符，突出产品价值和使用场景）

## Search Terms
（5-10个核心关键词，英文，逗号分隔）"""


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


async def generate_listing_stream(
    data: dict,
    system_instruction: str = DEFAULT_SYSTEM_INSTRUCTION,
) -> AsyncGenerator[str, None]:
    prompt = _build_prompt(data)
    async for chunk in await _client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    ):
        if chunk.text:
            yield chunk.text
