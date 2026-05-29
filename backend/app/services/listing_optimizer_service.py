import asyncio
import json
import logging
from typing import AsyncIterator, List, Optional

from ..core.config import settings
from .sorftime_client import call_sorftime_tool
from .kb_utils import get_policy_context
from .listing_creator_service import _call_ai_json

logger = logging.getLogger(__name__)
SITE_MAP = {"US": "amazon.com", "UK": "amazon.co.uk", "DE": "amazon.de", "JP": "amazon.co.jp"}


def sse(type_: str, **kwargs):
    return f"data: {json.dumps({'type': type_, **kwargs}, ensure_ascii=False)}\n\n"


async def run_optimizer(
    asin: str, competitor_asins: List[str], site: str,
    existing_title: str, existing_bullets: str,
    ai_model: str, mode: str,
) -> AsyncIterator[str]:

    site_domain = SITE_MAP.get(site, "amazon.com")

    # ── 1. 抓取数据 ──────────────────────────────────────────────────────────
    yield sse("status", content="正在采集产品数据...")

    tasks = []
    if asin:
        tasks.append(call_sorftime_tool("product_detail", {
            "amzSite": site, "asin": asin,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0))
    else:
        tasks.append(asyncio.sleep(0, result={}))

    comp_tasks = []
    for comp in competitor_asins[:3]:
        comp_tasks.append(call_sorftime_tool("product_detail", {
            "amzSite": site, "asin": comp,
        }, settings.sorftime_mcp_url, settings.sorftime_mcp_api_key, timeout=30.0))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    comp_results = await asyncio.gather(*comp_tasks, return_exceptions=True) if comp_tasks else []

    product_detail = results[0] if not isinstance(results[0], Exception) else {}
    logger.info("product_detail raw: %s", str(product_detail)[:500])
    comp_details = [r for r in comp_results if not isinstance(r, Exception)]

    # 如果有ASIN但没手动输入文案，从product_detail提取
    if asin and isinstance(product_detail, dict) and product_detail:
        raw_text = product_detail.get("raw", "") if "raw" in product_detail else ""
        if raw_text:
            # 解析纯文本格式
            import re
            if not existing_title:
                title_match = re.search(r'标题：(.+?)(?:\r?\n|$)', raw_text)
                if title_match:
                    existing_title = title_match.group(1).strip()
            if not existing_bullets:
                bullets_match = re.findall(r'五点描述\d*[：:](.+?)(?:\r?\n|$)', raw_text)
                if bullets_match:
                    existing_bullets = "\n".join(bullets_match)
        else:
            if not existing_title:
                existing_title = product_detail.get("title", "") or ""
            if not existing_bullets:
                bullets = product_detail.get("bullets", []) or product_detail.get("bullet_points", []) or []
                existing_bullets = "\n".join(bullets) if isinstance(bullets, list) else str(bullets)
        logger.info("extracted title: %s", existing_title[:100])
        logger.info("extracted bullets length: %d", len(existing_bullets))

    yield sse("status", content="数据采集完成，AI正在诊断...")

    # ── 2. 诊断 ──────────────────────────────────────────────────────────────
    if mode in ("diagnose", "both"):
        diag_prompt = _build_diagnose_prompt(existing_title, existing_bullets, comp_details, site)
        try:
            diagnosis = await _call_ai_json(diag_prompt, ai_model)
            yield sse("diagnosis", data=diagnosis)
        except Exception as e:
            yield sse("error", content=f"诊断失败: {str(e)}")
            return

    # ── 3. 优化 ──────────────────────────────────────────────────────────────
    if mode in ("optimize", "both"):
        yield sse("status", content="AI正在生成优化方案...")
        opt_prompt = _build_optimize_prompt(existing_title, existing_bullets, comp_details, site)
        try:
            optimized = await _call_ai_json(opt_prompt, ai_model)
            yield sse("optimized", data=optimized)
        except Exception as e:
            yield sse("error", content=f"优化失败: {str(e)}")
            return

    yield sse("done", content="完成")


def _build_diagnose_prompt(title: str, bullets: str, comp_details: list, site: str) -> str:
    comp_str = ""
    for i, comp in enumerate(comp_details[:3]):
        if isinstance(comp, dict):
            comp_title = comp.get("title", "")
            comp_bullets = comp.get("bullets", comp.get("bullet_points", []))
            if isinstance(comp_bullets, list):
                comp_bullets = "\n".join(comp_bullets[:3])
            comp_str += f"\n竞品{i+1}标题：{comp_title}\n竞品{i+1}五点（前3条）：{comp_bullets}\n"

    policy_context = get_policy_context(["compliance", "listing_rules"])
    policy_section = f"""
政策合规要求（用于合规检查维度）：
{policy_context}
""" if policy_context else ""

    return f"""你是亚马逊Listing诊断专家，专注{site}市场AI搜索时代的文案优化。
{policy_section}

现有Listing：
标题：{title}
五点描述：
{bullets}

竞品数据：{comp_str if comp_str else "无竞品数据"}

请从4个维度诊断这条Listing，严格返回以下JSON，不要有其他文字：

{{
  "ai_score": {{
    "total": 0,
    "breakdown": {{
      "title_keywords": {{"score": 0, "max": 25, "comment": "标题前80字符关键词覆盖情况"}},
      "bullet_facts": {{"score": 0, "max": 25, "comment": "五点是否有具体数字/可验证事实"}},
      "scene_coverage": {{"score": 0, "max": 25, "comment": "使用场景描述完整度"}},
      "no_buzzwords": {{"score": 0, "max": 25, "comment": "是否存在PREMIUM/PERFECT等无意义口号词"}}
    }},
    "ai_summary_prediction": "预测AI购物助手会给这个产品写的30字摘要",
    "overall_comment": "一句话总体评价"
  }},
  "keyword_gaps": {{
    "missing_high_value": ["竞品有但你没有的高价值词1", "词2", "词3"],
    "weak_placement": ["位置不对的词1", "词2"],
    "suggestions": ["建议加入词1", "词2", "词3"]
  }},
  "voc_anchors": {{
    "pain_points_addressed": ["已覆盖的买家痛点1", "痛点2"],
    "pain_points_missing": ["未覆盖的买家痛点1", "痛点2", "痛点3"],
    "scene_gaps": ["缺失的使用场景1", "场景2"]
  }},
  "compliance": {{
    "violations": [
      {{"type": "违规类型", "content": "具体违规内容", "severity": "高/中/低", "fix": "修改建议"}}
    ],
    "risks": ["潜在风险1", "风险2"],
    "safe": true
  }}
}}"""


def _build_optimize_prompt(title: str, bullets: str, comp_details: list, site: str) -> str:
    comp_str = ""
    for i, comp in enumerate(comp_details[:3]):
        if isinstance(comp, dict):
            comp_title = comp.get("title", "")
            comp_str += f"竞品{i+1}标题：{comp_title}\n"

    policy_context = get_policy_context(["compliance", "listing_rules"])
    policy_section = f"""
政策合规要求（改写时必须严格遵守）：
{policy_context}
""" if policy_context else ""

    return f"""你是亚马逊Listing文案专家，专注{site}市场。将以下现有Listing改写为符合AI搜索时代标准的版本。
{policy_section}

改写原则：
1. 标题前80字符必须包含最核心关键词+最大卖点
2. 每条Bullet必须有具体数字或可验证事实，禁用PREMIUM/PERFECT/BEST/HIGH QUALITY等口号词
3. 每条Bullet结构：大写卖点事实 - 具体描述（含数据或场景）- 买家得到什么
4. 整体文案要让AI购物助手能直接复述成有说服力的30字摘要
5. 保留原有核心关键词，补充竞品有但原文缺失的高价值词
6. Amazon字数硬上限(必须遵守)：标题≤200字符；每条Bullet 150-500字符；Search Terms≤249字节。超限必须精简，绝不超标

现有标题：{title}
现有五点：
{bullets}

竞品参考：{comp_str if comp_str else "无"}

请严格返回以下JSON，不要有其他文字：

{{
  "optimized_title": {{
    "a_version": "功能导向版标题（标注字符数）",
    "b_version": "场景导向版标题（标注字符数）",
    "changes": ["改动说明1", "改动说明2", "改动说明3"]
  }},
  "optimized_bullets": [
    {{"original": "原第1条", "optimized": "优化后第1条", "reason": "改动原因"}},
    {{"original": "原第2条", "optimized": "优化后第2条", "reason": "改动原因"}},
    {{"original": "原第3条", "optimized": "优化后第3条", "reason": "改动原因"}},
    {{"original": "原第4条", "optimized": "优化后第4条", "reason": "改动原因"}},
    {{"original": "原第5条", "optimized": "优化后第5条", "reason": "改动原因"}}
  ],
  "ai_summary_after": "优化后AI购物助手会写的30字摘要",
  "score_improvement": "预计AI可读性评分从X分提升到Y分",
  "search_terms": "补充的后台关键词字符串（≤249字节，空格分隔）"
}}"""
