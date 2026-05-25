import logging
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)

POLICY_CATEGORIES = ["compliance", "listing_rules"]

def get_policy_context(categories: list = None) -> str:
    """从知识库读取政策内容，注入到AI prompt中"""
    if categories is None:
        categories = POLICY_CATEGORIES
    try:
        from ..api.knowledge import KnowledgeItem
        from ..core.database import SessionLocal
        db = SessionLocal()
        try:
            items = db.query(KnowledgeItem).filter(
                KnowledgeItem.category.in_(categories)
            ).order_by(KnowledgeItem.category, KnowledgeItem.updated_at.desc()).all()

            if not items:
                return ""

            sections = {}
            for item in items:
                cat = item.category
                if cat not in sections:
                    sections[cat] = []
                sections[cat].append(f"【{item.title}】\n{item.content}")

            cat_labels = {
                "compliance": "合规红线",
                "listing_rules": "Listing规范",
                "ad_rules": "广告规则",
                "policy_updates": "最新政策",
            }

            parts = []
            for cat, items_list in sections.items():
                label = cat_labels.get(cat, cat)
                parts.append(f"=== {label} ===\n" + "\n\n".join(items_list))

            return "\n\n".join(parts)
        finally:
            db.close()
    except Exception as e:
        logger.warning("知识库读取失败，跳过注入: %s", e)
        return ""
