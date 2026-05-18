from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth
from .core.database import Base, engine

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
