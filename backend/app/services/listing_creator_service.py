import asyncio
import json
import logging
from typing import AsyncIterator, Dict, List, Optional

from ..core.config import settings
from .sorftime_client import call_sorftime_tool
from .kb_utils import get_policy_context

logger = logging.getLogger(__name__)

SITE_MAP = {"US": "amazon.com", "UK": "amazon.co.uk", "DE": "amazon.de", "JP": "amazon.co.jp"}
AMZSITE_MAP = {"US": "US", "UK": "GB", "DE": "DE", "JP": "JP"}


def sse(type_: str, **kwargs):
    return f"data: {json.dumps({'type': type_, **kwargs}, ensure_ascii=False)}\n\n"


async def analyze_listing_data(
    asin: str, competitor_asins: List[str], core_keywords: str,
    product_name: str, product_description: str, differentiation: str,
    site: str, voc_data: str, ai_model: str,
) -> AsyncIterator[str]:

    yield sse("status", content="正在采集Sorftime数据...")
    site_domain = SITE_MAP.get(site, "amazon.com")
    amz_site = AMZSITE_MAP.get(site, "US")

    # 并发采集数据
    tasks = []

    # 产品详情
    if asin:
        tasks.append(call_sorftime_tool("product_detail", {
            "keywordSupportSite": site_domain, "productId": asin,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0))
    else:
        tasks.append(asyncio.sleep(0, result={}))

    # 关键词数据
    if core_keywords:
        kw = core_keywords.split(',')[0].strip()
        tasks.append(call_sorftime_tool("keyword_detail", {
            "keywordSupportSite": site_domain, "keyword": kw,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0))
    else:
        tasks.append(asyncio.sleep(0, result={}))

    # 竞品详情（最多2个）
    comp_tasks = []
    for comp_asin in competitor_asins[:2]:
        comp_tasks.append(call_sorftime_tool("product_detail", {
            "keywordSupportSite": site_domain, "productId": comp_asin,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    comp_results = await asyncio.gather(*comp_tasks, return_exceptions=True) if comp_tasks else []

    product_detail = results[0] if not isinstance(results[0], Exception) else {}
    keyword_data = results[1] if not isinstance(results[1], Exception) else {}
    comp_details = [r for r in comp_results if not isinstance(r, Exception)]

    yield sse("status", content="数据采集完成，AI正在分析...")

    # 构建分析prompt
    prompt = _build_analysis_prompt(
        product_name, product_description, differentiation,
        product_detail, keyword_data, comp_details, voc_data, site
    )

    try:
        analysis = await _call_ai_json(prompt, ai_model)
        yield sse("done", analysis=analysis)
    except Exception as e:
        logger.error("analysis error: %s", e)
        yield sse("error", content=f"分析失败: {str(e)}")


def _build_analysis_prompt(
    product_name, product_description, differentiation,
    product_detail, keyword_data, comp_details, voc_data, site
) -> str:

    detail_str = ""
    if isinstance(product_detail, dict) and product_detail:
        detail_str = f"产品数据：{json.dumps(product_detail, ensure_ascii=False)[:1000]}"

    kw_str = ""
    if isinstance(keyword_data, dict) and keyword_data:
        kw_str = f"关键词数据：{json.dumps(keyword_data, ensure_ascii=False)[:500]}"

    comp_str = ""
    for i, comp in enumerate(comp_details[:2]):
        if isinstance(comp, dict):
            comp_str += f"竞品{i+1}：{json.dumps(comp, ensure_ascii=False)[:500]}\n"

    voc_str = f"VOC数据：{voc_data[:2000]}" if voc_data else ""

    return f"""你是亚马逊Listing优化专家。基于以下产品信息和市场数据，生成深度分析报告。

{policy_section}
产品名称：{product_name}
产品描述：{product_description}
差异化卖点：{differentiation}
目标市场：{site}

{detail_str}
{kw_str}
{comp_str}
{voc_str}

请严格返回以下JSON格式，不要有任何其他文字：

{{
  "cosmo": {{
    "product_positioning": "一句话产品定位",
    "product_side": [
      {{"dimension": "产品定义", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "替代品", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "作用对象", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "使用地点", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "核心功能", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "延伸用途", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "使用场景", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "购买动机", "content": "内容", "confidence": "强/中"}}
    ],
    "user_side": [
      {{"dimension": "使用者", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "搭配产品", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "关注维度", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "用户角色", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "深层需求", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "目标人群", "content": "内容", "confidence": "强/中"}},
      {{"dimension": "身体信号", "content": "内容", "confidence": "强/中"}}
    ],
    "differentiation_opportunities": ["机会1", "机会2", "机会3"],
    "keyword_groups": {{
      "功能词": ["词1", "词2", "词3"],
      "场景词": ["词1", "词2", "词3"],
      "人群词": ["词1", "词2", "词3"]
    }}
  }},
  "voc_insights": {{
    "warning": "如无真实VOC数据时显示的提示，有数据则为null",
    "positive_themes": [
      {{"name": "主题名", "percentage": "85%", "listing_tip": "Listing应用建议"}},
      {{"name": "主题名", "percentage": "70%", "listing_tip": "Listing应用建议"}},
      {{"name": "主题名", "percentage": "60%", "listing_tip": "Listing应用建议"}}
    ],
    "negative_themes": [
      {{"name": "主题名", "percentage": "40%", "solution": "在Listing中的解决方案"}},
      {{"name": "主题名", "percentage": "30%", "solution": "在Listing中的解决方案"}},
      {{"name": "主题名", "percentage": "20%", "solution": "在Listing中的解决方案"}}
    ]
  }},
  "market": {{
    "competition": "竞争格局描述",
    "price_range": "[推测]建议售价区间",
    "positioning": "定位建议",
    "supply_chain": "1688采购参考成本",
    "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]
  }}
}}"""


async def generate_listing_copy(
    input_data: dict, analysis: Optional[dict], ai_model: str
) -> AsyncIterator[str]:

    yield sse("status", content="AI正在生成Listing文案...")

    prompt = _build_copy_prompt(input_data, analysis)

    try:
        result = await _call_ai_json(prompt, ai_model)
        yield sse("done", listing=result)
    except Exception as e:
        logger.error("copy error: %s", e)
        yield sse("error", content=f"生成失败: {str(e)}")


def _build_copy_prompt(input_data: dict, analysis: Optional[dict]) -> str:
    product_name = input_data.get('product_name', '')
    brand_name = input_data.get('brand_name', '')
    description = input_data.get('product_description', '')
    differentiation = input_data.get('differentiation', '')
    keywords = input_data.get('core_keywords', '')
    site = input_data.get('site', 'US')

    analysis_str = ""
    if analysis:
        cosmo = analysis.get('cosmo', {})
        voc = analysis.get('voc_insights', {})
        market = analysis.get('market', {})
        analysis_str = f"""
COSMO分析结果：
产品定位：{cosmo.get('product_positioning', '')}
差异化机会：{', '.join(cosmo.get('differentiation_opportunities', []))}
关键词分组：{json.dumps(cosmo.get('keyword_groups', {}), ensure_ascii=False)}

VOC洞察：
正面主题：{', '.join([t['name'] for t in voc.get('positive_themes', [])])}
负面主题：{', '.join([t['name'] for t in voc.get('negative_themes', [])])}
负面解决方案：{'; '.join([t.get('solution','') for t in voc.get('negative_themes', [])])}

市场数据：
竞争格局：{market.get('competition', '')}
价格区间：{market.get('price_range', '')}
流量关键词：{', '.join(market.get('keywords', []))}
"""

    policy_context = get_policy_context(["compliance", "listing_rules"])
    policy_section = f"""
政策合规要求（必须严格遵守）：
{policy_context}
""" if policy_context else ""

    return f"""你是亚马逊Listing文案专家，专注{site}市场。基于以下信息生成高转化率的英文Listing文案。

产品信息：
品牌：{brand_name}
产品名：{product_name}
描述：{description}
差异化：{differentiation}
核心关键词：{keywords}

{analysis_str}

要求：
1. 标题：200字符以内，前80字符包含最重要关键词，自然流畅不堆砌
2. 五点：每点150-200字符，用大写关键词开头，突出卖点同时回应差评痛点
3. 描述：800-1500字符，讲故事，强化使用场景和情感价值
4. Search Terms：250字符以内，不重复标题和五点已有关键词
5. 合规自检：生成完成后检查是否违反上方政策要求，有违规词立即替换

请严格返回以下JSON格式：

{{
  "title": "英文标题",
  "bullets": [
    "KEYWORD: 五点1内容",
    "KEYWORD: 五点2内容",
    "KEYWORD: 五点3内容",
    "KEYWORD: 五点4内容",
    "KEYWORD: 五点5内容"
  ],
  "description": "英文产品描述",
  "search_terms": "keyword1, keyword2, keyword3"
}}"""


async def generate_image_strategy(
    input_data: dict, analysis: Optional[dict], listing: Optional[dict], ai_model: str
) -> AsyncIterator[str]:

    yield sse("status", content="AI正在生成图片策略...")

    product_name = input_data.get('product_name', '')
    title = listing.get('title', '') if listing else ''

    negative_themes = []
    if analysis and analysis.get('voc_insights'):
        negative_themes = [t['name'] for t in analysis['voc_insights'].get('negative_themes', [])]

    prompt = f"""你是亚马逊产品图片策略专家。为以下产品生成7张主图的拍摄/制作建议。

产品：{product_name}
标题：{title}
主要差评痛点：{', '.join(negative_themes)}

要求：每张图片用一句话说明拍摄主题、视觉元素、文字叠加建议。

请返回JSON格式：
{{"strategy": ["图1：...", "图2：...", "图3：...", "图4：...", "图5：...", "图6：...", "图7：..."]}}"""

    try:
        result = await _call_ai_json(prompt, ai_model)
        strategy = result.get('strategy', [])
        yield sse("done", strategy=strategy)
    except Exception as e:
        yield sse("error", content=f"生成失败: {str(e)}")


async def _call_ai_json(prompt: str, model: str) -> dict:
    import re, httpx

    async def call_deepseek():
        url = "https://api.deepseek.com/chat/completions"
        payload = {"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 4096}
        headers = {"Authorization": f"Bearer {settings.deepseek_api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def call_gemini():
        keys = [k for k in [settings.gemini_api_key, settings.gemini_api_key_2] if k]
        last_err = None
        for key in keys:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
                payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096}}
                async with httpx.AsyncClient(timeout=120) as client:
                    resp = await client.post(url, json=payload)
                    resp.raise_for_status()
                    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                last_err = e
                logger.warning("Gemini key失败，尝试下一个: %s", e)
        raise last_err

    async def call_claude():
        url = "https://api.anthropic.com/v1/messages"
        payload = {"model": "claude-sonnet-4-5", "max_tokens": 4096, "messages": [{"role": "user", "content": prompt}]}
        headers = {"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

    async def call_openai(model_name):
        url = "https://api.openai.com/v1/chat/completions"
        payload = {"model": model_name, "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 4096}
        headers = {"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    if model == "gemini":
        text = await call_gemini()
    elif model == "claude":
        text = await call_claude()
    elif model in ("gpt4o", "gpt4o_mini"):
        text = await call_openai("gpt-4o" if model == "gpt4o" else "gpt-4o-mini")
    else:
        text = await call_deepseek()

    # 解析JSON
    text = text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'^```\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    try:
        return json.loads(text)
    except:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
    return {"raw": text}
