# Amazon 运营助手第一期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建含登录、Listing生成、选品开发三模块的亚马逊运营助手全栈框架，前端React+Vite，后端FastAPI+SQLite，Docker Compose部署。

**Architecture:** 前后端分离，nginx统一入口（/ 服务前端静态文件，/api/* 反代FastAPI）。后端通过Claude API实现Listing生成（streaming SSE），通过Claude API + MCP tool use（Sorftime/卖家精灵）实现选品分析。所有AI响应流式推送给前端。历史记录写入SQLite。

**Tech Stack:** React 18 + TypeScript + Vite 5 + React Router v6 + Zustand 4 + Axios + Ant Design 5 / FastAPI + SQLAlchemy 2.0 + SQLite + python-jose + passlib + anthropic SDK / Docker Compose + nginx

---

## 文件结构总览

```
amazon-assistant/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── security.py
│   │   │   └── deps.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── listing_history.py
│   │   │   └── product_history.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── listing.py
│   │   │   └── product.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── listing_service.py
│   │       └── product_service.py
│   ├── scripts/
│   │   └── create_user.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_listing.py
│   │   └── test_product.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   └── authStore.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   ├── listing.ts
│   │   │   └── product.ts
│   │   ├── components/
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── AppLayout.tsx
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── ListingPage.tsx
│   │       └── ProductPage.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## Task 1: 项目脚手架与根目录配置

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: 创建根目录结构**

```bash
mkdir -p backend/app/core backend/app/models backend/app/api backend/app/services
mkdir -p backend/scripts backend/tests
mkdir -p frontend/src/store frontend/src/api frontend/src/components frontend/src/pages
mkdir -p docs/superpowers/plans docs/superpowers/specs
touch backend/app/__init__.py backend/app/core/__init__.py
touch backend/app/models/__init__.py backend/app/api/__init__.py backend/app/services/__init__.py
```

- [ ] **Step 2: 创建 `.gitignore`**

```
# Python
__pycache__/
*.pyc
.venv/
venv/
*.egg-info/
.pytest_cache/
test.db

# Node
node_modules/
dist/
.DS_Store

# Env & secrets
.env
data/

# SQLite
*.db
```

- [ ] **Step 3: 创建 `.env.example`**

```env
# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# JWT
JWT_SECRET=change-this-to-a-long-random-string
JWT_EXPIRE_HOURS=8

# MCP 服务（Sorftime）
SORFTIME_MCP_URL=
SORFTIME_MCP_API_KEY=

# MCP 服务（卖家精灵）
MAIJIA_MCP_URL=
MAIJIA_MCP_API_KEY=

# 数据库
DATABASE_URL=sqlite:///./data/amazon_assistant.db
```

- [ ] **Step 4: 复制并填写本地环境变量**

```bash
cp .env.example .env
# 编辑 .env，填入真实的 ANTHROPIC_API_KEY 和 JWT_SECRET
```

- [ ] **Step 5: 初始化 git 并提交**

```bash
git init
git add .gitignore .env.example docs/
git commit -m "chore: project scaffolding and spec docs"
```

---

## Task 2: 后端依赖与核心基础设施

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/core/security.py`

- [ ] **Step 1: 创建 `backend/requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
sqlalchemy==2.0.36
pydantic-settings==2.6.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
anthropic==0.40.0
python-multipart==0.0.12
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

- [ ] **Step 2: 安装依赖**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

- [ ] **Step 3: 创建 `backend/app/core/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    jwt_secret: str
    jwt_expire_hours: int = 8
    database_url: str = "sqlite:///./data/amazon_assistant.db"
    sorftime_mcp_url: str = ""
    sorftime_mcp_api_key: str = ""
    maijia_mcp_url: str = ""
    maijia_mcp_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 4: 创建 `backend/app/core/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: 创建 `backend/app/core/security.py`**

```python
from datetime import datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    payload = {"sub": str(user_id), "username": username, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
```

- [ ] **Step 6: 提交**

```bash
git add backend/
git commit -m "feat: backend core config, database, security"
```

---

## Task 3: SQLAlchemy 数据模型

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/listing_history.py`
- Create: `backend/app/models/product_history.py`

- [ ] **Step 1: 创建 `backend/app/models/user.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_pw: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: 创建 `backend/app/models/listing_history.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class ListingHistory(Base):
    __tablename__ = "listing_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    market: Mapped[str] = mapped_column(String, nullable=False)
    input_json: Mapped[str] = mapped_column(Text, nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: 创建 `backend/app/models/product_history.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class ProductHistory(Base):
    __tablename__ = "product_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    keyword: Mapped[str] = mapped_column(String, nullable=False)
    input_json: Mapped[str] = mapped_column(Text, nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=True)
    selling_price: Mapped[float] = mapped_column(Float, nullable=True)
    fba_fee: Mapped[float] = mapped_column(Float, nullable=True)
    cogs: Mapped[float] = mapped_column(Float, nullable=True)
    profit_margin: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: 提交**

```bash
git add backend/app/models/
git commit -m "feat: SQLAlchemy models for users, listing_history, product_history"
```

---

## Task 4: 依赖注入与认证 API

**Files:**
- Create: `backend/app/core/deps.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: 创建 `backend/app/core/deps.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from .database import get_db
from .security import decode_token
from ..models.user import User

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效凭证")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user
```

- [ ] **Step 2: 创建 `backend/app/api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..core.security import create_access_token, verify_password
from ..models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    token = create_access_token(user.id, user.username)
    return LoginResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, username=current_user.username, role=current_user.role)
```

- [ ] **Step 3: 写 `backend/tests/conftest.py`（测试先行）**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.models.user import User

TEST_DB_URL = "sqlite:///./test.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(test_engine)
    yield
    Base.metadata.drop_all(test_engine)


@pytest.fixture
def db():
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    user = User(username="testuser", hashed_pw=hash_password("testpass123"), role="member")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, test_user):
    resp = client.post("/api/auth/login", json={"username": "testuser", "password": "testpass123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 4: 写 `backend/tests/test_auth.py`（失败测试）**

```python
def test_login_success(client, test_user):
    resp = client.post("/api/auth/login", json={"username": "testuser", "password": "testpass123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, test_user):
    resp = client.post("/api/auth/login", json={"username": "testuser", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "用户名或密码错误"


def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert resp.status_code == 401


def test_me_requires_auth(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 403


def test_me_returns_user(client, auth_headers, test_user):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "testuser"
    assert data["role"] == "member"
```

- [ ] **Step 5: 此时测试会失败（main.py 还不存在），先创建最小 `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth
from .core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Amazon 运营助手")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
```

- [ ] **Step 6: 运行测试，确认通过**

```bash
cd backend
ANTHROPIC_API_KEY=test JWT_SECRET=testsecret pytest tests/test_auth.py -v
```

期望输出：
```
tests/test_auth.py::test_login_success PASSED
tests/test_auth.py::test_login_wrong_password PASSED
tests/test_auth.py::test_login_unknown_user PASSED
tests/test_auth.py::test_me_requires_auth PASSED
tests/test_auth.py::test_me_returns_user PASSED
5 passed
```

- [ ] **Step 7: 提交**

```bash
git add backend/app/core/deps.py backend/app/api/auth.py backend/app/main.py backend/tests/
git commit -m "feat: auth API with JWT login and /me endpoint"
```

---

## Task 5: Listing 生成服务（Claude API 流式）

**Files:**
- Create: `backend/app/services/listing_service.py`
- Create: `backend/tests/test_listing.py`（mock Claude）

- [ ] **Step 1: 写失败测试 `backend/tests/test_listing.py`**

```python
from unittest.mock import AsyncMock, patch


async def fake_stream(data):
    chunks = ['{"title":"Test Title","bullet_points":["B1","B2","B3","B4","B5"],', '"description":"Desc","search_terms":["k1","k2","k3","k4","k5"]}']
    for chunk in chunks:
        yield chunk


def test_listing_generate_streams(client, auth_headers):
    with patch("app.services.listing_service.generate_listing_stream", side_effect=fake_stream):
        resp = client.post(
            "/api/listing/generate",
            json={
                "product_name": "Wireless Earbuds",
                "features": "ANC, 30h battery",
                "market": "US",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_listing_history_empty(client, auth_headers):
    resp = client.get("/api/listing/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_listing_requires_auth(client):
    resp = client.post("/api/listing/generate", json={"product_name": "X", "market": "US"})
    assert resp.status_code == 403
```

- [ ] **Step 2: 创建 `backend/app/services/listing_service.py`**

```python
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
```

- [ ] **Step 3: 创建 `backend/app/api/listing.py`**

```python
import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.listing_history import ListingHistory
from ..models.user import User
from ..services.listing_service import generate_listing_stream

router = APIRouter(prefix="/api/listing", tags=["listing"])


class ListingRequest(BaseModel):
    product_name: str
    features: Optional[str] = None
    market: str = "US"
    asins: Optional[List[str]] = None
    keywords: Optional[str] = None


class HistoryItem(BaseModel):
    id: int
    product_name: str
    market: str
    result_json: Optional[str]
    created_at: str


@router.post("/generate")
async def generate_listing(
    body: ListingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collected: List[str] = []

    async def event_stream():
        async for chunk in generate_listing_stream(body.model_dump()):
            collected.append(chunk)
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        full_text = "".join(collected)
        record = ListingHistory(
            user_id=current_user.id,
            product_name=body.product_name,
            market=body.market,
            input_json=body.model_dump_json(),
            result_json=full_text,
        )
        db.add(record)
        db.commit()
        yield f"data: {json.dumps({'done': True, 'id': record.id})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history", response_model=List[HistoryItem])
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(ListingHistory)
        .filter(ListingHistory.user_id == current_user.id)
        .order_by(ListingHistory.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        HistoryItem(
            id=r.id,
            product_name=r.product_name,
            market=r.market,
            result_json=r.result_json,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]
```

- [ ] **Step 4: 在 `backend/app/main.py` 注册 listing 路由**

将 `main.py` 替换为：

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, listing
from .core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Amazon 运营助手")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(listing.router)
```

- [ ] **Step 5: 运行测试**

```bash
ANTHROPIC_API_KEY=test JWT_SECRET=testsecret pytest tests/test_listing.py -v
```

期望：3 passed

- [ ] **Step 6: 提交**

```bash
git add backend/app/services/listing_service.py backend/app/api/listing.py backend/app/main.py backend/tests/test_listing.py
git commit -m "feat: listing generation service with Claude API streaming"
```

---

## Task 6: 选品开发服务（Claude API + MCP tool use）

**Files:**
- Create: `backend/app/services/product_service.py`
- Create: `backend/app/api/product.py`
- Create: `backend/tests/test_product.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_product.py`**

```python
from unittest.mock import patch


async def fake_product_stream(data):
    payload = '{"market_overview":{"size":"10亿","competition":"中","avg_price":29.99},"competitors":[],"analysis":{"opportunities":["机会"],"risks":["风险"],"recommendation":"建议进入"}}'
    for ch in payload:
        yield ch


def test_product_research_streams(client, auth_headers):
    with patch("app.services.product_service.research_product_stream", side_effect=fake_product_stream):
        resp = client.post(
            "/api/product/research",
            json={
                "keyword": "cat tree",
                "category": "pet supplies",
                "dimensions": ["市场规模", "竞品"],
                "selling_price": 39.99,
                "fba_fee": 8.5,
                "cogs": 12.0,
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_product_history_empty(client, auth_headers):
    resp = client.get("/api/product/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_product_requires_auth(client):
    resp = client.post("/api/product/research", json={"keyword": "test"})
    assert resp.status_code == 403
```

- [ ] **Step 2: 创建 `backend/app/services/product_service.py`**

```python
from typing import AsyncGenerator

import anthropic

from ..core.config import settings

_async_client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """你是亚马逊选品专家。使用提供的MCP工具获取市场数据后，生成完整选品分析报告。
只返回严格JSON，不要其他文字：
{
  "market_overview": {"size": "市场规模描述", "competition": "低/中/高", "avg_price": 平均价格数字},
  "competitors": [{"asin": "B0...", "title": "标题", "price": 价格, "rating": 评分, "monthly_sales": 月销量}],
  "analysis": {"opportunities": ["机会点"], "risks": ["风险点"], "recommendation": "综合建议"}
}"""


def _build_prompt(data: dict) -> str:
    lines = []
    if data.get("category"):
        lines.append(f"类目：{data['category']}")
    if data.get("keyword"):
        lines.append(f"关键词：{data['keyword']}")
    if data.get("dimensions"):
        lines.append(f"分析维度：{', '.join(data['dimensions'])}")
    lines.append("请使用工具获取数据，然后生成完整的选品分析报告（JSON格式）。")
    return "\n".join(lines)


def _build_mcp_servers() -> list:
    servers = []
    if settings.sorftime_mcp_url:
        servers.append({
            "type": "url",
            "url": settings.sorftime_mcp_url,
            "name": "sorftime",
            "authorization_token": settings.sorftime_mcp_api_key,
        })
    if settings.maijia_mcp_url:
        servers.append({
            "type": "url",
            "url": settings.maijia_mcp_url,
            "name": "maijia",
            "authorization_token": settings.maijia_mcp_api_key,
        })
    return servers


async def research_product_stream(data: dict) -> AsyncGenerator[str, None]:
    prompt = _build_prompt(data)
    mcp_servers = _build_mcp_servers()

    kwargs: dict = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 4000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}],
        "betas": ["mcp-client-2025-04-04"],
    }
    if mcp_servers:
        kwargs["mcp_servers"] = mcp_servers

    async with _async_client.beta.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text
```

- [ ] **Step 3: 创建 `backend/app/api/product.py`**

```python
import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.deps import get_current_user
from ..models.product_history import ProductHistory
from ..models.user import User
from ..services.product_service import research_product_stream

router = APIRouter(prefix="/api/product", tags=["product"])


class ProductRequest(BaseModel):
    keyword: Optional[str] = None
    category: Optional[str] = None
    dimensions: Optional[List[str]] = None
    selling_price: Optional[float] = None
    fba_fee: Optional[float] = None
    cogs: Optional[float] = None


class HistoryItem(BaseModel):
    id: int
    keyword: str
    selling_price: Optional[float]
    fba_fee: Optional[float]
    cogs: Optional[float]
    profit_margin: Optional[float]
    result_json: Optional[str]
    created_at: str


def _calc_margin(selling_price, fba_fee, cogs) -> Optional[float]:
    if selling_price and selling_price > 0:
        profit = selling_price - (fba_fee or 0) - (cogs or 0)
        return round(profit / selling_price * 100, 2)
    return None


@router.post("/research")
async def research_product(
    body: ProductRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    collected: List[str] = []

    async def event_stream():
        async for chunk in research_product_stream(body.model_dump()):
            collected.append(chunk)
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        full_text = "".join(collected)
        margin = _calc_margin(body.selling_price, body.fba_fee, body.cogs)
        record = ProductHistory(
            user_id=current_user.id,
            keyword=body.keyword or body.category or "",
            input_json=body.model_dump_json(),
            result_json=full_text,
            selling_price=body.selling_price,
            fba_fee=body.fba_fee,
            cogs=body.cogs,
            profit_margin=margin,
        )
        db.add(record)
        db.commit()
        yield f"data: {json.dumps({'done': True, 'id': record.id, 'profit_margin': margin})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history", response_model=List[HistoryItem])
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(ProductHistory)
        .filter(ProductHistory.user_id == current_user.id)
        .order_by(ProductHistory.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        HistoryItem(
            id=r.id,
            keyword=r.keyword,
            selling_price=r.selling_price,
            fba_fee=r.fba_fee,
            cogs=r.cogs,
            profit_margin=r.profit_margin,
            result_json=r.result_json,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]
```

- [ ] **Step 4: 在 `backend/app/main.py` 注册 product 路由**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, listing, product
from .core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Amazon 运营助手")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(listing.router)
app.include_router(product.router)
```

- [ ] **Step 5: 运行全部测试**

```bash
ANTHROPIC_API_KEY=test JWT_SECRET=testsecret pytest tests/ -v
```

期望：所有 test 通过（8+ passed）

- [ ] **Step 6: 提交**

```bash
git add backend/app/services/product_service.py backend/app/api/product.py backend/app/main.py backend/tests/test_product.py
git commit -m "feat: product research service with Claude MCP tool use"
```

---

## Task 7: 管理员创建用户脚本

**Files:**
- Create: `backend/scripts/create_user.py`

- [ ] **Step 1: 创建 `backend/scripts/create_user.py`**

```python
#!/usr/bin/env python
"""
用法：python scripts/create_user.py <用户名> <密码> [admin|member]
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User

Base.metadata.create_all(bind=engine)


def create_user(username: str, password: str, role: str = "member"):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"错误：用户 '{username}' 已存在")
            return
        user = User(username=username, hashed_pw=hash_password(password), role=role)
        db.add(user)
        db.commit()
        print(f"✓ 用户 '{username}'（{role}）创建成功")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法：python scripts/create_user.py <用户名> <密码> [admin|member]")
        sys.exit(1)
    uname = sys.argv[1]
    pwd = sys.argv[2]
    r = sys.argv[3] if len(sys.argv) > 3 else "member"
    create_user(uname, pwd, r)
```

- [ ] **Step 2: 测试脚本可运行**

```bash
cd backend
ANTHROPIC_API_KEY=test JWT_SECRET=testsecret python scripts/create_user.py admin admin123 admin
```

期望输出：`✓ 用户 'admin'（admin）创建成功`

- [ ] **Step 3: 提交**

```bash
git add backend/scripts/create_user.py
git commit -m "feat: admin CLI script for creating users"
```

---

## Task 8: 后端 Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: 创建 `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: 提交**

```bash
git add backend/Dockerfile
git commit -m "chore: backend Dockerfile"
```

---

## Task 9: 前端脚手架（Vite + React + TypeScript）

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`

- [ ] **Step 1: 初始化前端项目**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
# 选择: React, TypeScript
```

- [ ] **Step 2: 安装依赖**

```bash
npm install
npm install react-router-dom zustand axios antd @ant-design/icons
```

- [ ] **Step 3: 更新 `frontend/vite.config.ts`（加入代理，开发时转发 /api 到后端）**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: 替换 `frontend/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import 'antd/dist/reset.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 5: 提交**

```bash
git add frontend/
git commit -m "chore: frontend scaffolding with Vite + React + Ant Design"
```

---

## Task 10: 认证 Store + API Client

**Files:**
- Create: `frontend/src/store/authStore.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: 创建 `frontend/src/store/authStore.ts`**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  username: string | null
  role: string | null
  setAuth: (token: string, username: string, role: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      role: null,
      setAuth: (token, username, role) => set({ token, username, role }),
      clearAuth: () => set({ token: null, username: null, role: null }),
    }),
    { name: 'auth-storage' },
  ),
)
```

- [ ] **Step 2: 创建 `frontend/src/api/client.ts`**

```typescript
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default client
```

- [ ] **Step 3: 创建 `frontend/src/api/auth.ts`**

```typescript
import client from './client'

export interface LoginPayload {
  username: string
  password: string
}

export interface UserInfo {
  id: number
  username: string
  role: string
}

export const apiLogin = (payload: LoginPayload) =>
  client.post<{ access_token: string }>('/auth/login', payload)

export const apiMe = () => client.get<UserInfo>('/auth/me')
```

- [ ] **Step 4: 创建 `frontend/src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Props {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: Props) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/store/ frontend/src/api/auth.ts frontend/src/api/client.ts frontend/src/components/ProtectedRoute.tsx
git commit -m "feat: auth store, axios client with JWT interceptor, ProtectedRoute"
```

---

## Task 11: 登录页面

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: 创建 `frontend/src/pages/LoginPage.tsx`**

```tsx
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, message, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { apiLogin, apiMe } from '../api/auth'
import { useAuthStore } from '../store/authStore'

const { Title } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form] = Form.useForm()
  const [loading, setLoading] = React.useState(false)

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const { data } = await apiLogin(values)
      // 获取用户信息
      const token = data.access_token
      // 临时设置 token 以便 apiMe 可以携带
      useAuthStore.setState({ token })
      const { data: user } = await apiMe()
      setAuth(token, user.username, user.role)
      message.success('登录成功')
      navigate('/')
    } catch {
      message.error('用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>亚马逊运营助手</Title>
          <Typography.Text type="secondary">请登录您的账号</Typography.Text>
        </div>
        <Form form={form} onFinish={handleLogin} layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

import React from 'react'
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: Chinese login page with Ant Design"
```

---

## Task 12: 全局布局与导航

**Files:**
- Create: `frontend/src/components/AppLayout.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: 创建 `frontend/src/components/AppLayout.tsx`**

```tsx
import {
  BarChartOutlined,
  LogoutOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Layout, Menu, theme, Typography } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/listing', icon: <UnorderedListOutlined />, label: 'Listing生成' },
  { key: '/product', icon: <BarChartOutlined />, label: '选品开发' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { username, clearAuth } = useAuthStore()
  const { token } = theme.useToken()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
            运营助手
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
          <Typography.Text>欢迎，{username}</Typography.Text>
          <LogoutOutlined
            style={{ cursor: 'pointer', fontSize: 18 }}
            title="退出登录"
            onClick={handleLogout}
          />
        </Header>
        <Content style={{ margin: 24, padding: 24, background: token.colorBgContainer, borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
```

- [ ] **Step 2: 创建 `frontend/src/App.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import ListingPage from './pages/ListingPage'
import LoginPage from './pages/LoginPage'
import ProductPage from './pages/ProductPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/listing" replace />} />
        <Route path="listing" element={<ListingPage />} />
        <Route path="product" element={<ProductPage />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/App.tsx frontend/src/components/AppLayout.tsx
git commit -m "feat: app routing and sidebar layout in Chinese"
```

---

## Task 13: API 函数（Listing + Product）

**Files:**
- Create: `frontend/src/api/listing.ts`
- Create: `frontend/src/api/product.ts`

- [ ] **Step 1: 创建 `frontend/src/api/listing.ts`**

```typescript
import { useAuthStore } from '../store/authStore'

export interface ListingRequest {
  product_name: string
  features?: string
  market: string
  asins?: string[]
  keywords?: string
}

export interface ListingResult {
  title: string
  bullet_points: string[]
  description: string
  search_terms: string[]
}

export async function streamGenerateListing(
  payload: ListingRequest,
  onChunk: (text: string) => void,
  onDone: (id: number) => void,
) {
  const token = useAuthStore.getState().token
  const resp = await fetch('/api/listing/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) throw new Error('请求失败')

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      if (data.text) onChunk(data.text)
      if (data.done) onDone(data.id)
    }
  }
}

export async function fetchListingHistory() {
  const token = useAuthStore.getState().token
  const resp = await fetch('/api/listing/history', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return resp.json()
}
```

- [ ] **Step 2: 创建 `frontend/src/api/product.ts`**

```typescript
import { useAuthStore } from '../store/authStore'

export interface ProductRequest {
  keyword?: string
  category?: string
  dimensions?: string[]
  selling_price?: number
  fba_fee?: number
  cogs?: number
}

export async function streamResearchProduct(
  payload: ProductRequest,
  onChunk: (text: string) => void,
  onDone: (id: number, profit_margin: number | null) => void,
) {
  const token = useAuthStore.getState().token
  const resp = await fetch('/api/product/research', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) throw new Error('请求失败')

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      if (data.text) onChunk(data.text)
      if (data.done) onDone(data.id, data.profit_margin ?? null)
    }
  }
}

export async function fetchProductHistory() {
  const token = useAuthStore.getState().token
  const resp = await fetch('/api/product/history', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return resp.json()
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/api/listing.ts frontend/src/api/product.ts
git commit -m "feat: frontend API functions for listing and product with SSE streaming"
```

---

## Task 14: Listing 生成页面

**Files:**
- Create: `frontend/src/pages/ListingPage.tsx`

- [ ] **Step 1: 创建 `frontend/src/pages/ListingPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import {
  Button, Card, Col, Divider, Form, Input, message,
  Row, Select, Space, Spin, Table, Tag, Tooltip, Typography,
} from 'antd'
import { CopyOutlined, HistoryOutlined } from '@ant-design/icons'
import { fetchListingHistory, ListingResult, streamGenerateListing } from '../api/listing'

const { TextArea } = Input
const { Title, Text, Paragraph } = Typography

const MARKET_OPTIONS = [
  { label: '美国 (US)', value: 'US' },
  { label: '英国 (UK)', value: 'UK' },
  { label: '德国 (DE)', value: 'DE' },
  { label: '日本 (JP)', value: 'JP' },
]

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

export default function ListingPage() {
  const [form] = Form.useForm()
  const [generating, setGenerating] = useState(false)
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<ListingResult | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const data = await fetchListingHistory()
    setHistory(data)
  }

  const handleGenerate = async (values: any) => {
    setGenerating(true)
    setRawText('')
    setResult(null)
    let accumulated = ''
    try {
      await streamGenerateListing(
        {
          product_name: values.product_name,
          features: values.features,
          market: values.market,
          asins: values.asins ? values.asins.split(',').map((s: string) => s.trim()) : undefined,
          keywords: values.keywords,
        },
        (chunk) => {
          accumulated += chunk
          setRawText(accumulated)
        },
        () => {
          try {
            const parsed = JSON.parse(accumulated)
            setResult(parsed)
          } catch {
            // 继续展示原始文本
          }
          loadHistory()
        },
      )
    } catch {
      message.error('生成失败，请检查网络或稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  const historyColumns = [
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { title: '市场', dataIndex: 'market', key: 'market', render: (v: string) => <Tag>{v}</Tag> },
    { title: '生成时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v.slice(0, 19).replace('T', ' ') },
  ]

  return (
    <div>
      <Row gutter={24}>
        <Col span={10}>
          <Card
            title="输入产品信息"
            extra={
              <Button icon={<HistoryOutlined />} onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? '隐藏历史' : '查看历史'}
              </Button>
            }
          >
            <Form form={form} layout="vertical" onFinish={handleGenerate}>
              <Form.Item name="product_name" label="产品名称" rules={[{ required: true, message: '请输入产品名称' }]}>
                <Input placeholder="如：Wireless Earbuds with ANC" />
              </Form.Item>
              <Form.Item name="features" label="产品特卖点">
                <TextArea rows={4} placeholder="列出核心卖点，每行一条" />
              </Form.Item>
              <Form.Item name="market" label="目标市场" initialValue="US">
                <Select options={MARKET_OPTIONS} />
              </Form.Item>
              <Form.Item name="asins" label="参考竞品 ASIN（最多3个，逗号分隔）">
                <Input placeholder="B0XXXXXX01, B0XXXXXX02" />
              </Form.Item>
              <Form.Item name="keywords" label="目标关键词（逗号分隔）">
                <Input placeholder="wireless earbuds, bluetooth headphones" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={generating} block>
                  {generating ? '生成中...' : '生成 Listing'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={14}>
          {generating && !result && (
            <Card>
              <Spin tip="AI 正在生成，请稍候..." />
              <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 12, color: '#888' }}>{rawText}</pre>
            </Card>
          )}

          {result && (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <ResultCard title="产品标题" content={result.title} />
              <Card
                title="五点描述"
                extra={<Tooltip title="复制全部"><CopyOutlined onClick={() => copyToClipboard(result.bullet_points.join('\n'))} /></Tooltip>}
              >
                {result.bullet_points.map((bp, i) => (
                  <Paragraph key={i}>• {bp}</Paragraph>
                ))}
              </Card>
              <ResultCard title="产品描述" content={result.description} />
              <Card
                title="Search Terms 关键词"
                extra={<Tooltip title="复制全部"><CopyOutlined onClick={() => copyToClipboard(result.search_terms.join(', '))} /></Tooltip>}
              >
                <Space wrap>
                  {result.search_terms.map((st, i) => <Tag key={i}>{st}</Tag>)}
                </Space>
              </Card>
            </Space>
          )}
        </Col>
      </Row>

      {showHistory && (
        <>
          <Divider>生成历史（最近 50 条）</Divider>
          <Table dataSource={history} columns={historyColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        </>
      )}
    </div>
  )
}

function ResultCard({ title, content }: { title: string; content: string }) {
  return (
    <Card
      title={title}
      extra={<Tooltip title="复制"><CopyOutlined onClick={() => copyToClipboard(content)} /></Tooltip>}
    >
      <Paragraph>{content}</Paragraph>
    </Card>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/pages/ListingPage.tsx
git commit -m "feat: listing generation page with streaming display and history"
```

---

## Task 15: 选品开发页面

**Files:**
- Create: `frontend/src/pages/ProductPage.tsx`

- [ ] **Step 1: 创建 `frontend/src/pages/ProductPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import {
  Button, Card, Checkbox, Col, Divider, Form, Input,
  InputNumber, message, Row, Space, Spin, Statistic, Table, Tag, Typography,
} from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import { fetchProductHistory, streamResearchProduct } from '../api/product'

const { TextArea } = Input
const { Title, Paragraph } = Typography

const DIMENSION_OPTIONS = [
  { label: '市场规模', value: '市场规模' },
  { label: '竞品分析', value: '竞品' },
  { label: '趋势分析', value: '趋势' },
  { label: '价格分布', value: '价格分布' },
]

interface MarketOverview {
  size: string
  competition: string
  avg_price: number
}

interface Competitor {
  asin: string
  title: string
  price: number
  rating: number
  monthly_sales: number
}

interface Analysis {
  opportunities: string[]
  risks: string[]
  recommendation: string
}

interface ProductResult {
  market_overview: MarketOverview
  competitors: Competitor[]
  analysis: Analysis
}

export default function ProductPage() {
  const [form] = Form.useForm()
  const [generating, setGenerating] = useState(false)
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<ProductResult | null>(null)
  const [profitMargin, setProfitMargin] = useState<number | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const sellingPrice = Form.useWatch('selling_price', form) ?? 0
  const fbaFee = Form.useWatch('fba_fee', form) ?? 0
  const cogs = Form.useWatch('cogs', form) ?? 0
  const liveMargin = sellingPrice > 0 ? ((sellingPrice - fbaFee - cogs) / sellingPrice * 100).toFixed(1) : '--'

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const data = await fetchProductHistory()
    setHistory(data)
  }

  const handleResearch = async (values: any) => {
    setGenerating(true)
    setRawText('')
    setResult(null)
    setProfitMargin(null)
    let accumulated = ''
    try {
      await streamResearchProduct(
        {
          keyword: values.keyword,
          category: values.category,
          dimensions: values.dimensions,
          selling_price: values.selling_price,
          fba_fee: values.fba_fee,
          cogs: values.cogs,
        },
        (chunk) => {
          accumulated += chunk
          setRawText(accumulated)
        },
        (_id, margin) => {
          setProfitMargin(margin)
          try {
            const parsed = JSON.parse(accumulated)
            setResult(parsed)
          } catch {
            // 原始文本展示
          }
          loadHistory()
        },
      )
    } catch {
      message.error('分析失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  const competitorColumns = [
    { title: 'ASIN', dataIndex: 'asin', key: 'asin' },
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '售价($)', dataIndex: 'price', key: 'price' },
    { title: '评分', dataIndex: 'rating', key: 'rating' },
    { title: '月销量', dataIndex: 'monthly_sales', key: 'monthly_sales' },
  ]

  const historyColumns = [
    { title: '关键词', dataIndex: 'keyword', key: 'keyword' },
    { title: '售价($)', dataIndex: 'selling_price', key: 'selling_price' },
    { title: 'FBA费用($)', dataIndex: 'fba_fee', key: 'fba_fee' },
    { title: '货成本($)', dataIndex: 'cogs', key: 'cogs' },
    { title: '利润率', dataIndex: 'profit_margin', key: 'profit_margin', render: (v: number) => v != null ? `${v}%` : '--' },
    { title: '分析时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v.slice(0, 19).replace('T', ' ') },
  ]

  return (
    <div>
      <Row gutter={24}>
        <Col span={10}>
          <Card
            title="选品分析"
            extra={
              <Button icon={<HistoryOutlined />} onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? '隐藏历史' : '查看历史'}
              </Button>
            }
          >
            <Form form={form} layout="vertical" onFinish={handleResearch}>
              <Form.Item name="category" label="类目">
                <Input placeholder="如：pet supplies" />
              </Form.Item>
              <Form.Item name="keyword" label="关键词">
                <Input placeholder="如：cat tree" />
              </Form.Item>
              <Form.Item name="dimensions" label="分析维度" initialValue={['市场规模', '竞品']}>
                <Checkbox.Group options={DIMENSION_OPTIONS} />
              </Form.Item>

              <Divider>利润测算</Divider>
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item name="selling_price" label="售价($)">
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="fba_fee" label="FBA费用($)">
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="cogs" label="货成本($)">
                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Statistic title="预计利润率" value={liveMargin} suffix="%" valueStyle={{ color: Number(liveMargin) > 20 ? '#3f8600' : '#cf1322' }} />
              </Card>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={generating} block>
                  {generating ? '分析中...' : '开始选品分析'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={14}>
          {generating && !result && (
            <Card>
              <Spin tip="AI 正在调取市场数据，请稍候..." />
              <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 12, color: '#888', maxHeight: 200, overflow: 'auto' }}>{rawText}</pre>
            </Card>
          )}

          {result && (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Row gutter={16}>
                <Col span={8}><Card><Statistic title="市场规模" value={result.market_overview.size} /></Card></Col>
                <Col span={8}><Card><Statistic title="竞争程度" value={result.market_overview.competition} /></Card></Col>
                <Col span={8}><Card><Statistic title="平均售价" value={`$${result.market_overview.avg_price}`} /></Card></Col>
              </Row>

              {profitMargin !== null && (
                <Card>
                  <Statistic
                    title="利润率（基于输入数据）"
                    value={profitMargin}
                    suffix="%"
                    valueStyle={{ color: profitMargin > 20 ? '#3f8600' : '#cf1322' }}
                  />
                </Card>
              )}

              <Card title="竞品数据">
                <Table dataSource={result.competitors} columns={competitorColumns} rowKey="asin" size="small" pagination={false} />
              </Card>

              <Card title="AI 综合分析">
                <Title level={5}>机会点</Title>
                {result.analysis.opportunities.map((o, i) => <Paragraph key={i}>✅ {o}</Paragraph>)}
                <Title level={5}>风险点</Title>
                {result.analysis.risks.map((r, i) => <Paragraph key={i}>⚠️ {r}</Paragraph>)}
                <Title level={5}>综合建议</Title>
                <Paragraph>{result.analysis.recommendation}</Paragraph>
              </Card>
            </Space>
          )}
        </Col>
      </Row>

      {showHistory && (
        <>
          <Divider>分析历史（最近 50 条）</Divider>
          <Table dataSource={history} columns={historyColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/pages/ProductPage.tsx
git commit -m "feat: product research page with profit calculator and streaming analysis"
```

---

## Task 16: 前端 Dockerfile + nginx 配置

**Files:**
- Create: `frontend/nginx.conf`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: 创建 `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # React SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反代后端 API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # 支持 SSE 流式传输
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

- [ ] **Step 2: 创建 `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: 提交**

```bash
git add frontend/nginx.conf frontend/Dockerfile
git commit -m "chore: frontend Dockerfile and nginx config with SSE proxy support"
```

---

## Task 17: Docker Compose 联调配置

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 `docker-compose.yml`**

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

- [ ] **Step 2: 确认 `.env` 存在并填写**

```bash
ls .env   # 确认存在
# 检查 ANTHROPIC_API_KEY 和 JWT_SECRET 已填写
```

- [ ] **Step 3: 创建数据目录**

```bash
mkdir -p data
```

- [ ] **Step 4: 构建并启动**

```bash
docker compose up --build -d
```

- [ ] **Step 5: 创建第一个管理员账号**

```bash
docker compose exec backend python scripts/create_user.py admin yourpassword admin
```

- [ ] **Step 6: 验证服务**

```bash
# 检查后端健康
curl http://localhost/api/auth/me
# 期望：{"detail":"Not authenticated"} 或 403，说明后端正常响应

# 浏览器打开 http://localhost，应看到登录页
```

- [ ] **Step 7: 提交**

```bash
git add docker-compose.yml data/.gitkeep
git commit -m "chore: Docker Compose with backend and frontend services"
```

---

## 自检结果

**Spec 覆盖：**
- ✅ 账号登录系统（JWT，用户名+密码）— Task 4
- ✅ Listing 生成（Claude API 流式，标题/五点/描述/ST）— Task 5–6, 14
- ✅ 选品开发（Claude API + MCP tool use，Sorftime/卖家精灵）— Task 6–7, 15
- ✅ 历史记录（listing_history, product_history）— Task 3, 5–6
- ✅ 利润测算字段（售价/FBA/货成本/利润率）— Task 6, 15
- ✅ 全前端中文界面 — Task 11–15
- ✅ Docker Compose 部署 — Task 17
- ✅ 管理员创建用户脚本 — Task 7
- ✅ nginx SSE 代理配置 — Task 16
