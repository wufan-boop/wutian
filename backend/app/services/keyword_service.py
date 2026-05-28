import asyncio
import csv
import io
import json
import logging
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from ..core.config import settings
from .sorftime_client import call_sorftime_tool

logger = logging.getLogger(__name__)

# ─── 内存存储（简单实现，后续可升级数据库）────────────────────────────────────
_projects: Dict[str, Dict] = {}


# ─── 关键词分类体系 ───────────────────────────────────────────────────────────

CATEGORY_LABELS = {
    "core": "核心词",
    "function": "功能词",
    "attribute": "属性词",
    "scene": "场景词",
    "audience": "人群词",
    "brand": "品牌词",
    "longtail": "长尾词",
}

QUADRANT_LABELS = {
    "main": "🟡 主推词",
    "potential": "🔵 潜力词",
    "redsea": "🔴 红海词",
    "avoid": "⚠️ 避坑词",
}


# ─── 数据采集 ─────────────────────────────────────────────────────────────────

async def _fetch_asin_keywords(asin: str, site: str) -> List[Dict]:
    """从Sorftime反查ASIN流量词，翻页拉取最多150条"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key
    if not mcp_url or not api_key:
        return []
    keywords = []
    try:
        for page in range(1, 6):  # 最多拉5页，每页20条，共100条
            result = await call_sorftime_tool(
                "product_traffic_terms",
                {"asin": asin, "amzSite": site, "page": page},
                mcp_url, api_key
            )
            items = result if isinstance(result, list) else result.get("data", [])
            if not items:
                break
            for item in items:
                kw = item.get("关键词") or item.get("keyword", "")
                if kw:
                    keywords.append({
                        "keyword": kw,
                        "search_volume": item.get("月搜索量") or item.get("searchVolume", 0),
                        "cpc": item.get("推荐竞价", ""),
                        "source": f"asin:{asin}",
                    })
            if len(items) < 20:  # 不足一页说明没有更多数据
                break
        logger.info("ASIN %s 共获取 %d 个关键词", asin, len(keywords))
    except Exception as e:
        logger.warning("Sorftime ASIN反查失败 %s: %s", asin, e)
    return keywords

    try:
        # 尝试卖家精灵的traffic_keyword工具
        result = await call_sorftime_tool(
            "traffic_keyword",
            {"asin": asin, "marketplace": site},
            mcp_url, api_key,
        )
        if result and isinstance(result, dict):
            items = result.get("data", result.get("list", result.get("keywords", [])))
            keywords = []
            for item in items[:50]:  # 最多50个
                kw = item.get("keyword") or item.get("searchTerm") or item.get("search_term", "")
                if kw:
                    keywords.append({
                        "keyword": kw,
                        "search_volume": item.get("searchVolume") or item.get("search_volume") or item.get("monthlySearches", 0),
                        "source": f"asin:{asin}",
                    })
            return keywords
    except Exception as e:
        logger.warning("卖家精灵ASIN反查失败 %s: %s", asin, e)

    return []


async def _fetch_keyword_extends(keyword: str, site: str) -> List[Dict]:
    """从Sorftime扩展关键词，翻页拉取最多5页（每页20条，共~100条）"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key

    if not mcp_url or not api_key:
        return []

    keywords: List[Dict] = []
    max_pages = getattr(settings, "sorftime_keyword_max_pages", 10)  # 可配置，默认10页
    try:
        for page in range(1, max_pages + 1):  # 每页20条
            result = await call_sorftime_tool(
                "keyword_extends",
                {"keyword": keyword, "keywordSupportSite": site, "page": page},
                mcp_url, api_key,
            )
            items = result if isinstance(result, list) else result.get("data", result.get("list", []))
            if not items:
                break
            for item in items:
                kw = item.get("关键词") or item.get("keyword") or item.get("extendKeyword", "")
                if kw:
                    keywords.append({
                        "keyword": kw,
                        "search_volume": item.get("月搜索量") or item.get("searchVolume") or item.get("weeklySearches", 0),
                        "cpc": item.get("cpc推荐竞价", ""),
                        "source": f"extend:{keyword}",
                    })
            if len(items) < 20:  # 不足一页说明没有更多
                break
        logger.info("关键词 %s 扩展获取 %d 个词", keyword, len(keywords))
    except Exception as e:
        logger.warning("Sorftime关键词扩展失败 %s: %s", keyword, e)
    return keywords

async def _fetch_keyword_detail(keyword: str, site: str) -> Dict:
    """获取关键词详情（搜索量、竞争度、CPC）"""
    mcp_url = settings.sorftime_mcp_url
    api_key = settings.sorftime_mcp_api_key

    if not mcp_url or not api_key:
        return {}

    try:
        result = await call_sorftime_tool(
            "keyword_detail",
            {"keyword": keyword, "keywordSupportSite": site},
            mcp_url, api_key
        )
        return result or {}
    except Exception as e:
        logger.warning("关键词详情获取失败 %s: %s", keyword, e)
        return {}




async def _enrich_and_score_keywords(
    all_keywords: dict,
    site: str,
) -> dict:
    """批量调 keyword_detail 补全数据，计算评分和层级"""
    # 最多补全前60个词（按已有搜索量排序，优先补高价值词）
    sorted_kws = sorted(all_keywords.keys(),
                        key=lambda k: all_keywords[k].get("search_volume", 0),
                        reverse=True)[:60]

    # 并发调用，每批10个避免超限
    async def fetch_one(kw):
        detail = await _fetch_keyword_detail(kw, site)
        return kw, detail

    enriched = {}
    for i in range(0, len(sorted_kws), 10):
        batch = sorted_kws[i:i+10]
        tasks = [fetch_one(kw) for kw in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, tuple):
                enriched[r[0]] = r[1]
        await asyncio.sleep(0.3)  # 避免频率限制

    # 计算评分
    def calc_score(kw, meta, detail):
        raw = detail if isinstance(detail, dict) else {}

        # 搜索量：优先用 detail 里的月搜索量
        try:
            vol = int(str(raw.get("月搜索量", meta.get("search_volume", 0))).replace(",", ""))
        except:
            vol = meta.get("search_volume", 0)

        # 竞品数量
        try:
            comp = int(str(raw.get("搜索结果竞品数量", 9999)).replace(",", ""))
        except:
            comp = 9999

        # CPC
        try:
            cpc = float(str(raw.get("推荐cpc竞价", raw.get("推荐竞价", meta.get("cpc", 1)))).replace(",", ""))
        except:
            cpc = 1.0

        # 需求分（0-30）：月搜索量归一化，10万封顶
        demand_score = min(vol / 100000, 1.0) * 30

        # 竞争分（0-25）：竞品数越少越高，5000封顶
        comp_score = max(0, (1 - min(comp / 5000, 1.0))) * 25

        # CPC价值分（0-25）：CPC在0.3-2.0区间得高分
        if cpc < 0.1:
            cpc_score = 5
        elif cpc <= 2.0:
            cpc_score = 25 * (cpc / 2.0)
        else:
            cpc_score = max(0, 25 - (cpc - 2.0) * 5)

        # 季节性分（0-20）：均衡旺季得满分，单季旺季扣分
        season = str(raw.get("词搜索量旺季", "均衡"))
        if "均衡" in season:
            season_score = 20
        elif season.count("、") >= 2:
            season_score = 14
        else:
            season_score = 8

        total = round(demand_score + comp_score + cpc_score + season_score)

        # 层级按月搜索量
        if vol >= 100000:
            level = 1
        elif vol >= 10000:
            level = 2
        elif vol >= 1000:
            level = 3
        else:
            level = 4

        return total, level, vol, comp, cpc

    scored = {}
    for kw in all_keywords:
        detail = enriched.get(kw, {})
        score, level, vol, comp, cpc = calc_score(kw, all_keywords[kw], detail)
        scored[kw] = {
            "score": score,
            "level": level,
            "search_volume_detail": vol,
            "competition": comp,
            "cpc_value": cpc,
        }

    return scored

# ─── AI分类 ──────────────────────────────────────────────────────────────────

CLASSIFY_SYSTEM_PROMPT = """你是亚马逊关键词分类专家。
将给定的关键词列表按以下7类分类，同时评估竞争象限：

分类（category）：
- core: 品类核心大词，搜索量最大（如 macbook case, laptop case）
- function: 功能描述词（如 hard shell, shockproof, waterproof, matte）
- attribute: 材质/尺寸/颜色/规格词（如 slim, lightweight, 13 inch, black）
- scene: 使用场景词（如 office, travel, college, commute）
- audience: 目标人群词（如 students, professionals, women, men）
- brand: 竞品品牌词（如 mosiso, ibenzer, kuzy）
- longtail: 3词以上精准长尾词

竞争象限（quadrant），基于搜索量和竞争度综合判断：
- main: 主推词（蓝海中池，搜索量中等+竞争中等）
- potential: 潜力词（小池机会，搜索量小+竞争小）
- redsea: 红海词（品类大词，搜索量大+竞争激烈）
- avoid: 避坑词（搜索量小+竞争激烈，性价比低）

返回JSON数组，每个元素格式：
{"keyword": "xxx", "category": "core", "quadrant": "redsea"}

只返回JSON数组，不要其他内容。"""


async def _classify_keywords_with_ai(
    keywords: List[str],
    ai_model: str = "deepseek"
) -> Dict[str, Dict]:
    """用AI批量分类关键词"""

    if not keywords:
        return {}

    # 分批处理，每批50个
    results = {}
    batches = [keywords[i:i+50] for i in range(0, len(keywords), 50)]

    for batch in batches:
        prompt = f"请对以下亚马逊关键词进行分类：\n{json.dumps(batch, ensure_ascii=False)}"

        try:
            response_text = ""

            if ai_model == "deepseek" and settings.deepseek_api_key:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        "https://api.deepseek.com/chat/completions",
                        json={
                            "model": "deepseek-chat",
                            "messages": [
                                {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            "max_tokens": 2000,
                            "stream": False
                        },
                        headers={"Authorization": f"Bearer {settings.deepseek_api_key}"}
                    )
                    data = resp.json()
                    response_text = data["choices"][0]["message"]["content"]

            elif settings.anthropic_api_key:
                import anthropic
                client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
                msg = await client.messages.create(
                    model="claude-haiku-4-5",
                    max_tokens=2000,
                    system=CLASSIFY_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}]
                )
                response_text = msg.content[0].text

            # 解析JSON
            clean = response_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            classified = json.loads(clean)

            for item in classified:
                kw = item.get("keyword", "")
                if kw:
                    results[kw] = {
                        "category": item.get("category", "longtail"),
                        "quadrant": item.get("quadrant", "potential"),
                    }

        except Exception as e:
            logger.warning("AI分类失败: %s", e)
            # 失败时默认分类
            for kw in batch:
                results[kw] = {"category": "longtail", "quadrant": "potential"}

    return results


# ─── 三色覆盖标记 ─────────────────────────────────────────────────────────────

def _calculate_coverage(
    keywords: List[str],
    listing_text: Optional[str],
    competitor_keywords: List[str],
) -> Dict[str, str]:
    """计算三色覆盖状态"""
    coverage = {}

    if not listing_text:
        return {kw: "none" for kw in keywords}

    listing_lower = listing_text.lower()
    competitor_set = {kw.lower() for kw in competitor_keywords}

    for kw in keywords:
        kw_lower = kw.lower()
        if kw_lower in listing_lower:
            coverage[kw] = "mine"      # 🔴 我司已埋
        elif kw_lower in competitor_set:
            coverage[kw] = "competitor"  # 🔵 竞品已埋
        else:
            coverage[kw] = "gap"       # 🟢 机会缺口
    return coverage


# ─── 主流程 ───────────────────────────────────────────────────────────────────

async def build_keyword_library(
    user_id: int,
    asins: List[str],
    keywords: List[str],
    listing_text: Optional[str],
    site: str,
    ai_model: str,
    db: Session,
) -> AsyncGenerator[Dict[str, Any], None]:

    project_id = str(uuid.uuid4())[:8]
    all_keywords: Dict[str, Dict] = {}  # keyword -> {search_volume, source, ...}
    competitor_keywords: List[str] = []

    # ── 第1步：从ASIN反查流量词 ──
    if asins:
        yield {"type": "status", "content": f"正在反查 {len(asins)} 个竞品ASIN的流量词..."}

        tasks = [_fetch_asin_keywords(asin, site) for asin in asins[:5]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                for item in result:
                    kw = item["keyword"]
                    competitor_keywords.append(kw)
                    if kw not in all_keywords:
                        all_keywords[kw] = item

        # 如果卖家精灵失败，用ASIN作为关键词通过Sorftime扩展
        if not all_keywords:
            for asin in asins[:2]:
                ext_result = await _fetch_keyword_extends(asin, site)
                for item in ext_result:
                    kw = item["keyword"]
                    if kw not in all_keywords:
                        all_keywords[kw] = item

        yield {"type": "status", "content": f"竞品反查完成，获得 {len(all_keywords)} 个关键词"}

    # ── 第2步：扩展核心关键词 ──
    if keywords:
        yield {"type": "status", "content": f"正在扩展 {len(keywords)} 个核心关键词..."}

        tasks = [_fetch_keyword_extends(kw, site) for kw in keywords[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                for item in result:
                    kw = item["keyword"]
                    if kw not in all_keywords:
                        all_keywords[kw] = item

        yield {"type": "status", "content": f"关键词扩展完成，共 {len(all_keywords)} 个关键词"}

    # ── 如果没有从MCP获取到数据，使用内置MacBook Neo关键词 ──
    if not all_keywords:
        yield {"type": "status", "content": "MCP数据暂不可用，使用内置关键词库..."}
        builtin = _get_builtin_keywords(keywords, asins, site)
        all_keywords.update(builtin)

    # ── 第3步：AI分类 ──
    yield {"type": "status", "content": f"正在对 {len(all_keywords)} 个关键词进行AI智能分类..."}

    kw_list = list(all_keywords.keys())
    classifications = await _classify_keywords_with_ai(kw_list, ai_model)

    # ── 第3.5步：补全数据+评分+层级 ──
    yield {"type": "status", "content": f"正在获取 {min(len(all_keywords),60)} 个关键词的详细数据并评分..."}
    scored_data = await _enrich_and_score_keywords(all_keywords, site)

    # ── 第4步：计算三色覆盖 ──
    coverage = _calculate_coverage(kw_list, listing_text, competitor_keywords)

    # ── 第5步：组装结果 ──
    keyword_results = []
    for kw, meta in all_keywords.items():
        cls = classifications.get(kw, {})
        category = cls.get("category", "longtail")
        quadrant = cls.get("quadrant", "potential")
        cov = coverage.get(kw, "none")

        sc = scored_data.get(kw, {})
        keyword_results.append({
            "keyword": kw,
            "search_volume": sc.get("search_volume_detail") or meta.get("search_volume", 0),
            "source": meta.get("source", ""),
            "category": category,
            "category_label": CATEGORY_LABELS.get(category, category),
            "quadrant": quadrant,
            "quadrant_label": QUADRANT_LABELS.get(quadrant, quadrant),
            "coverage": cov,
            "coverage_label": {
                "mine": "🔴 我司已埋",
                "competitor": "🔵 竞品已埋",
                "gap": "🟢 机会缺口",
                "none": "—",
            }.get(cov, "—"),
            "score": sc.get("score", 0),
            "level": sc.get("level", 4),
            "competition": sc.get("competition", 0),
            "cpc_value": sc.get("cpc_value", 0),
        })

    # 按搜索量排序
    keyword_results.sort(key=lambda x: x["search_volume"], reverse=True)

    # 统计各象限数量
    stats = {
        "total": len(keyword_results),
        "main": sum(1 for k in keyword_results if k["quadrant"] == "main"),
        "potential": sum(1 for k in keyword_results if k["quadrant"] == "potential"),
        "redsea": sum(1 for k in keyword_results if k["quadrant"] == "redsea"),
        "avoid": sum(1 for k in keyword_results if k["quadrant"] == "avoid"),
        "gap_count": sum(1 for k in keyword_results if k["coverage"] == "gap"),
    }

    # 存储项目
    _projects[project_id] = {
        "project_id": project_id,
        "user_id": user_id,
        "name": ", ".join(keywords[:2]) or ", ".join(asins[:1]) or "关键词库",
        "keywords": keyword_results,
        "stats": stats,
        "created_at": datetime.now().isoformat(),
    }

    yield {
        "type": "done",
        "project_id": project_id,
        "keywords": keyword_results,
        "stats": stats,
    }


def _get_builtin_keywords(keywords: List[str], asins: List[str], site: str) -> Dict[str, Dict]:
    """内置关键词库（MCP不可用时的降级方案）"""
    # MacBook Neo 专用关键词
    builtin = {
        "macbook neo case": {"search_volume": 8500, "source": "builtin"},
        "macbook neo 13 case": {"search_volume": 6200, "source": "builtin"},
        "macbook neo case 13 inch": {"search_volume": 5800, "source": "builtin"},
        "macbook neo 13 inch case 2026": {"search_volume": 4200, "source": "builtin"},
        "macbook neo case a3404": {"search_volume": 3800, "source": "builtin"},
        "macbook neo hard shell case": {"search_volume": 3200, "source": "builtin"},
        "macbook neo matte case": {"search_volume": 2800, "source": "builtin"},
        "macbook neo case with keyboard cover": {"search_volume": 2400, "source": "builtin"},
        "macbook neo protective case": {"search_volume": 2100, "source": "builtin"},
        "macbook neo slim case": {"search_volume": 1900, "source": "builtin"},
        "macbook neo case black": {"search_volume": 1800, "source": "builtin"},
        "macbook neo case clear": {"search_volume": 1700, "source": "builtin"},
        "macbook neo case pink": {"search_volume": 1600, "source": "builtin"},
        "macbook neo laptop cover": {"search_volume": 1500, "source": "builtin"},
        "macbook neo accessories": {"search_volume": 1400, "source": "builtin"},
        "case for macbook neo 13": {"search_volume": 1300, "source": "builtin"},
        "macbook neo 2026 case": {"search_volume": 1200, "source": "builtin"},
        "macbook neo a18 pro case": {"search_volume": 1100, "source": "builtin"},
        "macbook neo keyboard cover": {"search_volume": 1000, "source": "builtin"},
        "macbook neo screen protector": {"search_volume": 950, "source": "builtin"},
        "macbook neo anti fingerprint case": {"search_volume": 850, "source": "builtin"},
        "macbook neo frosted case": {"search_volume": 780, "source": "builtin"},
        "macbook neo travel case": {"search_volume": 720, "source": "builtin"},
        "macbook neo student case": {"search_volume": 680, "source": "builtin"},
        "macbook neo bundle case keyboard screen": {"search_volume": 520, "source": "builtin"},
    }

    # 如果有自定义关键词，也加进去
    for kw in keywords:
        if kw not in builtin:
            builtin[kw] = {"search_volume": 0, "source": "custom"}

    return builtin


# ─── 项目管理 ─────────────────────────────────────────────────────────────────

def get_user_projects(user_id: int, db: Session) -> List[Dict]:
    """获取用户的历史项目"""
    projects = [
        {
            "project_id": p["project_id"],
            "name": p["name"],
            "total": p["stats"]["total"],
            "created_at": p["created_at"],
        }
        for p in _projects.values()
        if p["user_id"] == user_id
    ]
    return sorted(projects, key=lambda x: x["created_at"], reverse=True)


def get_project_result(project_id: str, user_id: int, db: Session) -> Optional[Dict]:
    """获取项目详情"""
    project = _projects.get(project_id)
    if not project or project["user_id"] != user_id:
        return None
    return project


def export_to_csv(project_id: str, user_id: int, db: Session) -> Optional[str]:
    """导出为CSV"""
    project = _projects.get(project_id)
    if not project or project["user_id"] != user_id:
        return None

    output = io.StringIO()
    writer = csv.writer(output)

    # 写入BOM（Excel中文兼容）
    output.write('\ufeff')

    # 表头
    writer.writerow([
        "关键词", "搜索量", "分类", "竞争象限",
        "覆盖状态", "数据来源"
    ])

    # 数据行
    for kw in project["keywords"]:
        writer.writerow([
            kw["keyword"],
            kw["search_volume"],
            kw["category_label"],
            kw["quadrant_label"],
            kw["coverage_label"],
            kw["source"],
        ])

    return output.getvalue()
