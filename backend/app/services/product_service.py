import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, Any, Optional

import httpx
from google import genai
from google.genai import types

from ..core.config import settings
from .sorftime_client import call_sorftime_tool

logger = logging.getLogger(__name__)

_gemini_client = genai.Client(api_key=settings.gemini_api_key)

# ─── 系统提示词 ───────────────────────────────────────────────────────────────

DEFAULT_SYSTEM_INSTRUCTION = """你是一名经验丰富的亚马逊选品分析师，专注美国市场，熟悉中国卖家的资源禀赋和供应链逻辑。当用户给你ASIN或品类关键词时，按以下方法论做选品可行性判断，输出明确做/不做/观望结论+完整数据链。

输出格式要求：用清晰的文字直接输出，不要使用任何Markdown符号。使用数字编号和缩进组织内容，确保在手机和电脑上都能直接阅读。

分析框架（5个模块）

模块1：5维筛选
1. 市场容量：TOP50月销总和，>$30万健康，<$5万谨慎
2. 竞争度：TOP20中评论数<100占比>30%有破局空间；中国卖家>70%内卷严重
3. 利润空间：售价-COGS-FBA-佣金15%-头程-广告15%-退货3%=净利率，<15%不做，15-25%谨慎，>25%可做
4. 趋势：近6个月新品占比>20%市场活跃；旺淡季差距>3倍=季节性风险
5. 进入壁垒：认证/专利/退货率，有专利风险直接排除

模块2：差异化机会识别
1. 场景缺口：竞品未覆盖的使用场景
2. Listing质量缺口：头部竞品图片差/标题弱/A+缺失
3. 评论痛点：TOP评论反复出现的抱怨=产品改良方向
4. 价格带空白：哪个区间竞争少但需求存在
5. 受众细分：头部打泛人群，你打细分

模块3：现金流与周转
1. 预估净利率（含计算依据）
2. 库存周转次数/年
3. ROIC=净利率×周转次数
4. 首批备货建议：备货量+备货金额+资金回笼周期
5. 现金流压力：低(<$3万)/中($3-10万)/高(>$10万)

模块4：供应链可行性
1. 1688采购难度：标准品/定制品/需开模
2. 起订量：是否适合中小卖家
3. 物流建议：海运/空运/海快
4. 头程成本估算
5. 质检难点

模块5：风险清单
3-5条主要风险，每条含严重度(高/中/低)+描述+缓解建议

输出结构：
1. 一句话结论：做/不做/观望+核心理由+关键数据
2. 5维评分表：维度|数据|评分(1-5)|判断
3. 差异化机会：Top2-3切入点+可操作性
4. 现金流测算：项目|数值|备注，含首批备货建议
5. 供应链评估：难度+注意事项
6. 风险清单：风险|严重度|描述|缓解建议
7. 下一步3个行动项：具体可执行+时间节点

核心原则：数据驱动，无数据标【推测】；必须给做/不做/观望三选一；中国卖家视角；输出语气像10年经验运营和朋友讨论，直接说人话"""

# 验证产品模式专用提示词
VALIDATE_SYSTEM_INSTRUCTION = """你是一名经验丰富的亚马逊选品分析师。用户提供了1个竞品ASIN，请做单品深度分析报告。

输出格式：纯文字，数字编号，不用Markdown符号。

分析内容：
1. 一句话结论：这个产品值不值得跟进，核心理由
2. 产品基本面：价格/评分/评论数/BSR排名/月销量估算
3. Listing质量分析：标题/图片/五点/A+页面的优劣势
4. 流量词分析：主要流量来源关键词，竞争难度
5. 差异化切入点：如果要做，怎么做出差异
6. 利润测算：基于当前售价估算净利率
7. 风险提示：2-3个主要风险
8. 结论：做/不做/观望+具体理由

核心原则：数据驱动，无数据标【推测】；中国卖家视角；直接说人话"""

# 候选对比模式专用提示词
COMPARE_SYSTEM_INSTRUCTION = """你是一名经验丰富的亚马逊选品分析师。用户提供了2-3个候选ASIN，请做横向对比决策报告。

输出格式：纯文字，数字编号，不用Markdown符号。

分析内容：
1. 一句话结论：推荐哪个产品，核心理由
2. 对比总表：维度|ASIN1|ASIN2|ASIN3，包含价格/月销/评论数/竞争度/利润率/供应链难度
3. 各产品优劣势分析
4. 最终推荐：选哪个，为什么，下一步行动

核心原则：必须给明确推荐，不能三个都推荐；中国卖家视角；直接说人话"""

# 潜力产品模式专用提示词
POTENTIAL_SYSTEM_INSTRUCTION = """你是一名经验丰富的亚马逊选品分析师。以下是从平台筛选出的潜力产品列表，请分析哪些值得深入研究。

输出格式：纯文字，数字编号，不用Markdown符号。

分析内容：
1. TOP3推荐产品：ASIN+推荐理由+关键数据
2. 每个推荐产品的切入策略
3. 需要规避的产品（如有）及原因
4. 下一步验证行动

核心原则：数据驱动；中国卖家视角；直接说人话"""


# ─── 数据采集 ─────────────────────────────────────────────────────────────────

async def _fetch_validate_data(data: dict) -> Dict[str, Any]:
    """验证产品模式：单ASIN深度数据"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    asin = data.get("asin") or (data.get("asins") or [None])[0]
    site = data.get("site", "US")

    if not asin:
        return {}

    tasks = [
        call_sorftime_tool("product_detail", {"productId": asin, "keywordSupportSite": site}, mcp_url, api_key),
        call_sorftime_tool("competitor_product_keywords", {"productId": asin, "keywordSupportSite": site}, mcp_url, api_key),
        call_sorftime_tool("product_reviews", {"asin": asin, "amzSite": "US", "reviewType": "Both"}, mcp_url, api_key),
    ]
    keys = ["product_detail", "competitor_keywords", "reviews"]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    market_data = {}
    for key, result in zip(keys, results):
        if not isinstance(result, Exception) and result:
            market_data[key] = result
    return market_data


async def _fetch_compare_data(data: dict) -> Dict[str, Any]:
    """候选对比模式：多ASIN并发采集"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    asins = data.get("asins") or []
    site = data.get("site", "US")

    if not asins:
        return {}

    tasks = []
    keys = []
    for asin in asins[:3]:  # 最多3个
        tasks.append(call_sorftime_tool("product_detail", {"productId": asin, "keywordSupportSite": site}, mcp_url, api_key))
        keys.append(f"product_{asin}")

    results = await asyncio.gather(*tasks, return_exceptions=True)
    market_data = {}
    for key, result in zip(keys, results):
        if not isinstance(result, Exception) and result:
            market_data[key] = result
    return market_data


async def _fetch_keyword_data(data: dict) -> Dict[str, Any]:
    """找方向模式：关键词+长尾扩展"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    keyword = data.get("keyword") or data.get("category") or ""
    site = data.get("site", "US")
    enable_longtail = data.get("enable_longtail", False)

    if not keyword:
        return {}

    tasks = [
        call_sorftime_tool("keyword_detail", {"keyword": keyword, "keywordSupportSite": site}, mcp_url, api_key),
        call_sorftime_tool("similar_product_feature", {"productName": keyword, "keywordSupportSite": site}, mcp_url, api_key),
    ]
    keys = ["keyword_detail", "product_features"]

    if enable_longtail:
        tasks.append(call_sorftime_tool("keyword_extends", {"keyword": keyword, "keywordSupportSite": site}, mcp_url, api_key))
        keys.append("longtail_keywords")

    results = await asyncio.gather(*tasks, return_exceptions=True)
    market_data = {}
    for key, result in zip(keys, results):
        if not isinstance(result, Exception) and result:
            market_data[key] = result
    return market_data


async def _fetch_batch_data(data: dict) -> Dict[str, Any]:
    """批量初筛模式：纯条件筛选，不调AI"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    site = data.get("site", "US")

    params = {"keywordSupportSite": site}
    if data.get("price_min"):
        params["price_min"] = data["price_min"]
    if data.get("price_max"):
        params["price_max"] = data["price_max"]
    if data.get("month_sales_min"):
        params["month_sales_volume_min"] = data["month_sales_min"]
    if data.get("keyword"):
        params["searchName"] = data["keyword"]

    result = await call_sorftime_tool("potential_product", params, mcp_url, api_key)
    return {"batch_results": result} if result else {}


async def _fetch_potential_data(data: dict) -> Dict[str, Any]:
    """潜力产品模式"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    site = data.get("site", "US")

    params: Dict[str, Any] = {"keywordSupportSite": site}
    if data.get("price_min"):
        params["price_min"] = data["price_min"]
    if data.get("price_max"):
        params["price_max"] = data["price_max"]
    if data.get("month_sales_min"):
        params["month_sales_volume_min"] = data["month_sales_min"]

    result = await call_sorftime_tool("potential_product", params, mcp_url, api_key)
    return {"potential_products": result} if result else {}


async def _fetch_from_sellersprite(data: dict) -> Dict[str, Any]:
    """卖家精灵数据（关键词研究）"""
    mcp_url = getattr(settings, 'maijia_mcp_url', None)
    api_key = getattr(settings, 'maijia_mcp_api_key', None)
    if not mcp_url or not api_key:
        return {}

    keyword = data.get("keyword") or data.get("category") or ""
    site = data.get("site", "US")
    if not keyword:
        return {}

    try:
        result = await call_sorftime_tool(
            "keyword_research",
            {"keyword": keyword, "marketplace": site},
            mcp_url, api_key
        )
        return {"keyword_research": result} if result else {}
    except Exception as e:
        logger.warning("卖家精灵调用失败: %s", e)
        return {}


async def _fetch_market_data(data: dict) -> Dict[str, Any]:
    """根据选品模式分发数据采集"""
    mode = data.get("mode", "keyword")

    try:
        if mode == "validate":
            return await _fetch_validate_data(data)
        elif mode == "compare":
            return await _fetch_compare_data(data)
        elif mode == "batch":
            return await _fetch_batch_data(data)
        elif mode == "potential":
            return await _fetch_potential_data(data)
        else:
            # keyword模式：先尝试卖家精灵，失败切Sorftime
            result = await _fetch_from_sellersprite(data)
            if result:
                logger.info("使用卖家精灵数据")
                return result
            result = await _fetch_keyword_data(data)
            if result:
                logger.info("使用Sorftime数据")
                return result
    except Exception as e:
        logger.warning("数据采集失败 mode=%s: %s", mode, e)

    return {}


# ─── 提示词构建 ───────────────────────────────────────────────────────────────

def _build_prompt(data: dict, market_data: Dict[str, Any]) -> str:
    mode = data.get("mode", "keyword")
    site = data.get("site", "US")
    lines = []

    # 基础信息
    if data.get("category"):
        lines.append(f"类目：{data['category']}")
    if data.get("keyword"):
        lines.append(f"关键词：{data['keyword']}")
    if data.get("asin"):
        lines.append(f"分析ASIN：{data['asin']}")
    if data.get("asins"):
        lines.append(f"对比ASIN列表：{', '.join(data['asins'])}")
    lines.append(f"目标站点：{site}")

    # 筛选条件
    filters = []
    if data.get("price_min") or data.get("price_max"):
        filters.append(f"价格区间：${data.get('price_min', 0)}-${data.get('price_max', '不限')}")
    if data.get("month_sales_min"):
        filters.append(f"目标月销量≥{data['month_sales_min']}")
    if data.get("weight_max_lb"):
        filters.append(f"重量上限：{data['weight_max_lb']}lb")
    if data.get("budget_cny"):
        filters.append(f"首批备货预算：{data['budget_cny']}万RMB")
    if data.get("team_size"):
        filters.append(f"团队规模：{data['team_size']}")
    if data.get("supply_chain"):
        filters.append(f"供应链优势：{data['supply_chain']}")
    if data.get("exclude_categories"):
        filters.append(f"排除类目：{', '.join(data['exclude_categories'])}")
    if data.get("exclude_certification"):
        filters.append("排除需认证类目（FDA/UL等）")
    if data.get("exclude_seasonal"):
        filters.append("排除强季节性产品")

    if filters:
        lines.append("\n筛选条件：")
        lines.extend([f"  - {f}" for f in filters])

    # 市场数据
    if market_data:
        lines.append("\n以下是从市场数据平台获取的真实数据，请基于这些数据进行分析：")
        lines.append(json.dumps(market_data, ensure_ascii=False, indent=2))

    lines.append("\n请生成完整的选品分析报告。")
    return "\n".join(lines)


def _get_system_instruction(mode: str, custom_instruction: Optional[str] = None) -> str:
    """根据模式返回对应提示词"""
    if custom_instruction:
        return custom_instruction
    mapping = {
        "validate": VALIDATE_SYSTEM_INSTRUCTION,
        "compare": COMPARE_SYSTEM_INSTRUCTION,
        "potential": POTENTIAL_SYSTEM_INSTRUCTION,
    }
    return mapping.get(mode, DEFAULT_SYSTEM_INSTRUCTION)


# ─── AI 生成 ──────────────────────────────────────────────────────────────────

async def _generate_with_claude(prompt: str, system_instruction: str) -> AsyncGenerator[str, None]:
    """用 Claude 生成内容（流式）"""
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    async with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        system=system_instruction,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        async for text in stream.text_stream:
            yield text



async def _generate_with_openai(prompt: str, system_instruction: str, model: str = "gpt-4o") -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                "stream": True,
                "max_tokens": 4000,
            },
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        ) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        delta = data["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except:
                        pass

async def _generate_with_deepseek(prompt: str, system_instruction: str) -> AsyncGenerator[str, None]:
    """用 DeepSeek 生成内容（流式）"""
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            "https://api.deepseek.com/chat/completions",
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 4000,
                "stream": True
            },
            headers={
                "Authorization": f"Bearer {settings.deepseek_api_key}",
                "Content-Type": "application/json"
            }
        ) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        text = chunk["choices"][0]["delta"].get("content", "")
                        if text:
                            yield text
                    except Exception:
                        continue


async def _generate_with_gemini(prompt: str, system_instruction: str) -> AsyncGenerator[str, None]:
    """用 Gemini 生成内容（流式）"""
    async for chunk in await _gemini_client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    ):
        if chunk.text:
            yield chunk.text


# ─── 批量初筛（不调AI，直接返回数据）────────────────────────────────────────

async def _batch_filter_stream(data: dict) -> AsyncGenerator[Dict[str, Any], None]:
    """批量初筛：纯MCP筛选，0 token成本"""
    yield {"type": "status", "content": "正在按条件筛选产品..."}
    market_data = await _fetch_batch_data(data)

    if not market_data:
        yield {"type": "text", "content": "未找到符合条件的产品，请调整筛选条件后重试。"}
        return

    results = market_data.get("batch_results", {})
    items = results.get("data", results.get("list", []))

    if not items:
        yield {"type": "text", "content": "未找到符合条件的产品，请调整筛选条件后重试。"}
        return

    # 格式化输出，不调AI
    lines = [f"批量初筛结果（共{len(items)}个产品）\n"]
    for i, item in enumerate(items[:20], 1):  # 最多显示20个
        asin = item.get("asin", "")
        title = item.get("title", "")[:50]
        price = item.get("price", 0)
        monthly_sales = item.get("monthlySales", item.get("monthly_sales", 0))
        bsr = item.get("bsr", "")
        rating = item.get("rating", "")
        reviews = item.get("reviews", 0)

        lines.append(
            f"{i}. {asin}\n"
            f"   标题：{title}...\n"
            f"   价格：${price}  月销：{monthly_sales}  BSR：{bsr}  评分：{rating}（{reviews}条）\n"
        )

    yield {"type": "text", "content": "\n".join(lines)}


# ─── 主入口 ───────────────────────────────────────────────────────────────────

async def research_product_stream(
    data: dict,
    system_instruction: Optional[str] = None,
    ai_model: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    mode = data.get("mode", "keyword")

    # 批量初筛模式：跳过AI，直接返回筛选结果
    if mode == "batch":
        async for event in _batch_filter_stream(data):
            yield event
        return

    # 其他模式：采集数据 + AI分析
    yield {"type": "status", "content": "正在获取市场数据..."}

    try:
        market_data = await _fetch_market_data(data)
    except Exception as exc:
        logger.warning("数据采集失败: %s", exc)
        market_data = {}

    yield {"type": "status", "content": "正在生成分析报告..."}

    # 确定系统提示词
    final_system = _get_system_instruction(mode, system_instruction)
    prompt = _build_prompt(data, market_data)

    # 确定使用的AI模型（优先前端指定，其次自动选择）
    model = ai_model or "gemini"  # 默认Gemini

    generators = []
    if model == "claude" or model == "claude-sonnet-4-6":
        generators = [
            ("Claude", _generate_with_claude(prompt, final_system)),
            ("DeepSeek", _generate_with_deepseek(prompt, final_system)),
            ("Gemini", _generate_with_gemini(prompt, final_system)),
        ]
    elif model in ("gpt-4o", "gpt-4o-mini"):
        gpt_model = "gpt-4o-mini" if model == "gpt-4o-mini" else "gpt-4o"
        generators = [
            ("GPT-4o", _generate_with_openai(prompt, final_system, gpt_model)),
            ("Gemini", _generate_with_gemini(prompt, final_system)),
        ]
    elif model == "deepseek" or model == "deepseek-chat":
        generators = [
            ("DeepSeek", _generate_with_deepseek(prompt, final_system)),
            ("Gemini", _generate_with_gemini(prompt, final_system)),
        ]
    else:
        # 默认：Gemini → DeepSeek fallback
        generators = [
            ("Gemini", _generate_with_gemini(prompt, final_system)),
            ("DeepSeek", _generate_with_deepseek(prompt, final_system)),
        ]

    last_error = None
    for model_name, generator in generators:
        try:
            async for text in generator:
                yield {"type": "text", "content": text}
            return  # 成功则直接返回
        except Exception as e:
            last_error = e
            logger.warning("%s 失败，切换下一个模型: %s", model_name, e)
            if model_name != generators[-1][0]:  # 不是最后一个才提示切换
                yield {"type": "status", "content": f"切换备用模型..."}

    # 所有模型都失败
    logger.error("所有AI模型均失败: %s", last_error)
    yield {"type": "error", "content": "AI 服务暂时不可用，请稍后重试"}
