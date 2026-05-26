import asyncio
import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

from ..core.config import settings
from .sorftime_client import call_sorftime_tool

logger = logging.getLogger(__name__)

SITE_MAP = {"US": "amazon.com", "UK": "amazon.co.uk", "DE": "amazon.de", "JP": "amazon.co.jp"}


async def _fetch_reviews(asin: str, site: str) -> Dict[str, Any]:
    """采集好评100条+差评100条"""
    site_domain = SITE_MAP.get(site, "amazon.com")
    
    good, bad, detail = await asyncio.gather(
        call_sorftime_tool("product_reviews", {
            "asin": asin,
            "amzSite": site,
            "reviewType": "Positive",
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=60.0),
        call_sorftime_tool("product_reviews", {
            "asin": asin,
            "amzSite": site,
            "reviewType": "Negative",
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=60.0),
        call_sorftime_tool("product_detail", {
            "keywordSupportSite": site_domain,
            "productId": asin,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0),
    )
    return {"good": good, "bad": bad, "detail": detail, "asin": asin}


def _build_voc_prompt(reviews_data: Dict, competitor_data: List[Dict], analysis_mode: str) -> str:
    asin = reviews_data["asin"]
    detail = reviews_data.get("detail", {})
    good_reviews = reviews_data.get("good", {})
    bad_reviews = reviews_data.get("bad", {})

    # 提取评论文本
    def extract_reviews(data, max_count=100):
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for key in ["reviews", "data", "list", "items"]:
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break
            if not items and "raw" in data:
                return str(data["raw"])[:3000]
        texts = []
        for r in items[:max_count]:
            if isinstance(r, dict):
                # Sorftime返回格式：评论、评星、标题
                text = r.get("评论") or r.get("reviewContent") or r.get("content") or r.get("body") or r.get("text") or str(r)
                rating = r.get("评星") or r.get("starRating") or r.get("rating") or ""
                if text:
                    texts.append(f"[{rating}★] {text[:300]}")
        return "\n".join(texts) if texts else str(data)[:2000]

    good_text = extract_reviews(good_reviews)
    bad_text = extract_reviews(bad_reviews)
    
    product_name = ""
    if isinstance(detail, dict):
        product_name = detail.get("title") or detail.get("productTitle") or asin
    
    total_reviews = ""
    avg_rating = ""
    if isinstance(detail, dict):
        total_reviews = str(detail.get("reviewsCount") or detail.get("totalReviews") or "")
        avg_rating = str(detail.get("starRating") or detail.get("rating") or "")

    competitor_section = ""
    if competitor_data:
        comp_texts = []
        for cd in competitor_data:
            comp_asin = cd.get("asin", "")
            comp_bad = extract_reviews(cd.get("bad", {}), 50)
            comp_texts.append(f"竞品{comp_asin}差评：\n{comp_bad[:1000]}")
        competitor_section = "\n\n【竞品评论数据】\n" + "\n---\n".join(comp_texts)

    prompt = f"""你是亚马逊运营专家，请基于以下真实评论数据生成专业的VOC深度分析报告。

【产品信息】
ASIN: {asin}
产品名: {product_name}
总评论数: {total_reviews}
平均评分: {avg_rating}★

【好评数据（{len(good_text.split(chr(10)))}条）】
{good_text}

【差评数据（{len(bad_text.split(chr(10)))}条）】
{bad_text}
{competitor_section}

请严格按以下JSON格式输出，不要有任何其他文字：

{{
  "overview": {{
    "total_reviews": "{total_reviews}",
    "avg_rating": "{avg_rating}",
    "positive_rate": "估算好评率%",
    "negative_rate": "估算差评率%",
    "rating_distribution": {{
      "5star": "百分比%", "4star": "百分比%", "3star": "百分比%", "2star": "百分比%", "1star": "百分比%"
    }},
    "confidence": "本次分析基于X条真实评论"
  }},
  "personas": [
    {{
      "name": "人群名称",
      "type": "日常用户/礼品购买者等",
      "count": "X条提及",
      "who": {{"age": "年龄", "gender": "性别", "occupation": "职业"}},
      "what": {{"core_need": "核心需求", "pain_point": "最大痛点"}},
      "how": {{"frequency": "使用频率", "habit": "使用习惯", "trigger": "购买触发"}},
      "where": {{"scene": "主要场景", "context": "环境细节"}},
      "quotes": ["原文评论1", "原文评论2", "原文评论3"]
    }}
  ],
  "use_scenes": [
    {{
      "name": "场景名称",
      "count": "X条提及",
      "description": "场景描述",
      "quotes": ["原文1", "原文2", "原文3"]
    }}
  ],
  "purchase_motivations": [
    {{
      "name": "动机名称",
      "count": "X条提及",
      "quotes": ["原文1", "原文2", "原文3"]
    }}
  ],
  "positive_tops": [
    {{
      "name": "好评主题",
      "count": "X条提及",
      "listing_tip": "Listing应用建议",
      "quotes": ["原文1", "原文2", "原文3"]
    }}
  ],
  "negative_tops": [
    {{
      "name": "差评主题",
      "count": "X条提及",
      "listing_tip": "Listing应用建议",
      "competitor_rate": "竞品同类问题占比（有竞品数据时填写）",
      "quotes": ["原文1", "原文2", "原文3"]
    }}
  ],
  "unmet_needs": [
    {{
      "name": "未满足需求",
      "count": "X条提及",
      "opportunity": "差异化机会",
      "quotes": ["原文1", "原文2"]
    }}
  ],
  "keywords": [
    {{"word": "关键词", "count": 数字, "sentiment": "positive/negative/neutral"}}
  ],
  "kano": {{
    "must_have": [{{"name": "需求名", "tags": ["基础", "生理"], "description": "说明"}}],
    "performance": [{{"name": "需求名", "tags": ["基础", "生理"], "description": "说明"}}],
    "delighter": [{{"name": "需求名", "tags": ["期望", "尊重"], "description": "说明"}}],
    "indifferent": []
  }},
  "improvement_roadmap": [
    {{
      "priority": "高/中/低",
      "name": "改进项目",
      "negative_rate": "X%差评提及",
      "action": "具体改进措施",
      "expected_result": "预期效果"
    }}
  ],
  "listing_application": {{
    "title_insight": "用户最关注XXX，建议标题突出XXX",
    "title_example": "建议标题示例",
    "bullets_insight": "需要在五点中接回应的差评点",
    "bullets_example": ["五点1", "五点2", "五点3", "五点4", "五点5"],
    "description_insight": "详细描述建议",
    "description_example": "建议描述示例（200字内）",
    "images_insight": "图片策略建议",
    "images_example": ["主图建议", "功能图建议", "细节图建议", "场景图建议", "对比图建议"]
  }}
}}"""
    return prompt


async def analyze_voc(
    asin: str,
    competitor_asins: List[str],
    site: str,
    ai_model: str,
) -> AsyncIterator[str]:
    """流式VOC分析，yield SSE格式字符串"""

    def sse(type_: str, **kwargs):
        return f"data: {json.dumps({'type': type_, **kwargs}, ensure_ascii=False)}\n\n"

    yield sse("status", content=f"正在采集 {asin} 的评论数据...")

    # 采集主产品评论
    try:
        main_data = await _fetch_reviews(asin, site)
    except Exception as e:
        logger.error("fetch reviews error: %s", e)
        main_data = {"good": {}, "bad": {}, "detail": {}, "asin": asin}

    yield sse("status", content=f"评论采集完成，正在采集竞品数据...")

    # 采集竞品评论
    competitor_data = []
    for comp_asin in competitor_asins[:3]:
        try:
            comp = await _fetch_reviews(comp_asin, site)
            competitor_data.append(comp)
        except Exception:
            pass

    yield sse("status", content="正在用AI分析评论数据，生成12板块报告...")

    # 构建prompt
    prompt = _build_voc_prompt(main_data, competitor_data, "single")

    # 调用AI
    try:
        report_json = await _call_ai(prompt, ai_model)
        yield sse("done", report=report_json)
    except Exception as e:
        import traceback
        logger.error("AI analysis error: %s\n%s", e, traceback.format_exc())
        yield sse("error", content=f"AI分析失败: {str(e)}")


async def _call_ai(prompt: str, model: str) -> Dict:
    """调用AI生成VOC报告"""
    import httpx

    if model == "gemini":
        return await _call_gemini(prompt)
    elif model == "deepseek":
        return await _call_deepseek(prompt)
    elif model == "claude":
        return await _call_claude(prompt)
    elif model in ("gpt4o", "gpt4o_mini"):
        return await _call_openai(prompt, model)
    else:
        return await _call_gemini(prompt)


async def _call_gemini(prompt: str) -> Dict:
    import httpx
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.gemini_api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 8192}
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_json_response(text)


async def _call_deepseek(prompt: str) -> Dict:
    import httpx
    url = "https://api.deepseek.com/chat/completions"
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 8192,
    }
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return _parse_json_response(text)


async def _call_claude(prompt: str) -> Dict:
    import httpx
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 16000,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        logger.info("Claude response stop_reason: %s", data.get("stop_reason"))
        logger.info("Claude usage: %s", data.get("usage"))
        text = data["content"][0]["text"]
        logger.info("Claude response text length: %d", len(text))
        logger.info("Claude response first 500 chars: %s", text[:500])
        logger.info("Claude response last 200 chars: %s", text[-200:])
        return _parse_json_response(text)


async def _call_openai(prompt: str, model: str) -> Dict:
    import httpx
    model_name = "gpt-4o" if model == "gpt4o" else "gpt-4o-mini"
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 8192,
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return _parse_json_response(text)


def _parse_json_response(text: str) -> Dict:
    """从AI响应中提取JSON"""
    import re
    text = text.strip()
    # 去掉markdown代码块
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'^```\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试提取{}之间的内容
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {"raw": text}
