from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, users, chat, listing, product, prompts, keyword, voc, listing_creator, knowledge, listing_optimizer
from .core.database import Base, engine
from .models import prompt  # noqa: F401 — ensure table is created
from .api.knowledge import KnowledgeItem  # noqa: F401 — ensure table is created

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Amazon 运营助手")

from .core.config import settings as _settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(voc.router)
app.include_router(listing_creator.router)
app.include_router(users.router)
app.include_router(voc.router)
app.include_router(listing_creator.router)
app.include_router(chat.router)
app.include_router(listing.router)
app.include_router(product.router)
app.include_router(prompts.router)
app.include_router(keyword.router)
app.include_router(knowledge.router)
app.include_router(listing_optimizer.router)
