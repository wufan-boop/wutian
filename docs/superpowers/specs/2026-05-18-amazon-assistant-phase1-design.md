# Amazon 运营助手 第一期 — 设计文档

**日期：** 2026-05-18  
**状态：** 已审核  
**技术栈：** React (Vite) + FastAPI + SQLite  
**部署：** 云服务器，Docker Compose

---

## 1. 项目目标

为 2–10 人的亚马逊运营小团队提供内部工具，第一期覆盖三个核心模块：

1. **账号登录系统** — 用户名 + 密码，JWT 鉴权
2. **Listing 生成** — 调 Claude API，输入产品信息生成标题/五点/描述/ST 关键词
3. **选品开发** — Claude API 通过 MCP tool use 调 Sorftime / 卖家精灵，分析市场与竞品

---

## 2. 整体架构

```
amazon-assistant/
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── pages/             # LoginPage / ListingPage / ProductPage
│   │   ├── components/        # 共用 UI（Form、Card、Spinner 等）
│   │   ├── api/               # Axios 实例 + 各模块请求函数
│   │   ├── store/             # Zustand（authStore：token、user）
│   │   └── App.tsx            # 路由配置
│   ├── Dockerfile
│   └── nginx.conf
│
├── backend/                   # FastAPI + Python 3.12
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py        # POST /api/auth/login, /api/auth/me
│   │   │   ├── listing.py     # POST /api/listing/generate
│   │   │   └── product.py     # POST /api/product/research
│   │   ├── models/
│   │   │   ├── user.py            # SQLAlchemy User 模型
│   │   │   ├── listing_history.py # ListingHistory 模型
│   │   │   └── product_history.py # ProductHistory 模型（含利润字段）
│   │   ├── services/
│   │   │   ├── listing_service.py   # Claude API 调用，生成 Listing
│   │   │   └── product_service.py   # Claude API + MCP tool use（Sorftime / 卖家精灵）
│   │   ├── core/
│   │   │   ├── config.py      # 环境变量读取（pydantic-settings）
│   │   │   ├── database.py    # SQLite engine + session
│   │   │   ├── security.py    # 密码 hash（bcrypt）、JWT 签发/验证
│   │   │   └── deps.py        # FastAPI 依赖注入（get_db、get_current_user）
│   │   └── main.py            # FastAPI app、CORS、路由注册
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml
└── .env                       # 不入 git（ANTHROPIC_API_KEY、JWT_SECRET 等）
```

**请求链路：**
```
浏览器 → nginx :80
  /          → React SPA (静态文件)
  /api/*     → FastAPI :8000 (反代)
```

后端不暴露公网端口，统一经 nginx 进入。

---

## 3. 数据库设计（SQLite）

### users 表

| 列          | 类型         | 说明                    |
|-------------|--------------|-------------------------|
| id          | INTEGER PK   | 自增主键                |
| username    | TEXT UNIQUE  | 用户名                  |
| hashed_pw   | TEXT         | bcrypt 哈希             |
| role        | TEXT         | `admin` / `member`      |
| created_at  | DATETIME     | 创建时间                |

### listing_history 表

| 列           | 类型       | 说明                                      |
|--------------|------------|-------------------------------------------|
| id           | INTEGER PK | 自增主键                                  |
| user_id      | INTEGER FK | 关联 users.id                             |
| product_name | TEXT       | 产品名称                                  |
| market       | TEXT       | 目标市场（US/UK/DE/JP）                   |
| input_json   | TEXT       | 完整输入参数（JSON 序列化）               |
| result_json  | TEXT       | 生成结果（title/bullets/description/ST）  |
| created_at   | DATETIME   | 创建时间                                  |

### product_history 表

| 列              | 类型       | 说明                                      |
|-----------------|------------|-------------------------------------------|
| id              | INTEGER PK | 自增主键                                  |
| user_id         | INTEGER FK | 关联 users.id                             |
| keyword         | TEXT       | 搜索关键词或类目                          |
| input_json      | TEXT       | 完整输入参数（JSON 序列化）               |
| result_json     | TEXT       | 市场分析+竞品+利润测算结果（JSON）        |
| selling_price   | REAL       | 利润测算：售价（美元）                    |
| fba_fee         | REAL       | 利润测算：FBA 费用                        |
| cogs            | REAL       | 利润测算：货成本                          |
| profit_margin   | REAL       | 利润测算：利润率（自动计算）              |
| created_at      | DATETIME   | 创建时间                                  |

---

## 4. 认证模块

- **登录**：`POST /api/auth/login` 接收 `{username, password}`，验证通过返回 JWT（有效期 8 小时）
- **鉴权**：所有非 login 接口通过 `Authorization: Bearer <token>` 验证
- **前端**：token 存 Zustand + localStorage，Axios 拦截器自动带上；401 时跳回登录页
- **用户创建**：第一期无注册页，由管理员通过 CLI 脚本（`scripts/create_user.py`）创建账号

---

## 5. Listing 生成模块

### 前端输入表单

| 字段           | 说明                         |
|----------------|------------------------------|
| 产品名称       | 必填                         |
| 产品特卖点     | 多行文本，列出核心卖点       |
| 目标市场       | 下拉选择（US / UK / DE / JP）|
| 参考竞品 ASIN  | 选填，最多 3 个              |
| 目标关键词     | 选填，逗号分隔               |

### 后端流程（`listing_service.py`）

1. 将表单内容拼装为结构化 prompt
2. 调用 Claude API（`claude-sonnet-4-6`，流式输出）
3. 要求 Claude 返回 JSON：`{title, bullet_points[5], description, search_terms[5]}`
4. FastAPI 以 Server-Sent Events（SSE）将内容流式推给前端

### 前端输出展示

- 四个区块分别展示：标题 / 五点描述 / 产品描述 / ST 关键词
- 每个区块有一键复制按钮
- 生成中显示流式加载效果

---

## 6. 选品开发模块

### 前端输入

| 字段       | 说明                              |
|------------|-----------------------------------|
| 类目       | 文本输入（如 "pet supplies"）     |
| 关键词     | 文本输入（如 "cat tree"）         |
| 分析维度   | 多选：市场规模/竞品/趋势/价格分布 |
| 售价       | 数字输入，单位美元（利润测算）    |
| FBA 费用   | 数字输入，单位美元（利润测算）    |
| 货成本     | 数字输入，单位美元（利润测算）    |

利润率由前端实时计算展示：`(售价 - FBA费用 - 货成本) / 售价 × 100%`，保存时连同结果一并写入 product_history。

### 后端流程（`product_service.py`）

1. 构建带有 MCP tool use 的 Claude API 请求
2. Claude API 配置中挂载 Sorftime MCP 和卖家精灵 MCP（通过 `mcp_servers` 参数）
3. Claude 自主决定调用哪些工具（关键词搜索量、竞品分析、市场趋势等）
4. Claude 汇总工具返回的数据，生成结构化分析报告
5. 同样以 SSE 流式返回前端

### 前端输出展示

- 市场概览卡片（规模、竞争度、平均价格）
- 竞品列表表格（ASIN、标题、价格、评分、月销量）
- AI 综合分析文本（机会点 / 风险点 / 建议）

---

## 7. API 端点汇总

| 方法 | 路径                      | 鉴权 | 说明                     |
|------|---------------------------|------|--------------------------|
| POST | `/api/auth/login`         | 否   | 登录，返回 JWT           |
| GET  | `/api/auth/me`            | 是   | 获取当前用户信息         |
| POST | `/api/listing/generate`   | 是   | 生成 Listing（SSE）      |
| GET  | `/api/listing/history`    | 是   | 查询当前用户 Listing 历史|
| POST | `/api/product/research`   | 是   | 选品分析（SSE）          |
| GET  | `/api/product/history`    | 是   | 查询当前用户选品历史     |

---

## 8. 前端路由

| 路径         | 组件            | 鉴权 |
|--------------|-----------------|------|
| `/login`     | LoginPage       | 否   |
| `/listing`   | ListingPage     | 是   |
| `/product`   | ProductPage     | 是   |
| `/`          | 重定向 /listing | 是   |

ProtectedRoute 组件统一处理鉴权跳转。

---

## 9. 环境变量（`.env`）

```env
# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# JWT
JWT_SECRET=<随机长字符串>
JWT_EXPIRE_HOURS=8

# MCP 服务（Sorftime / 卖家精灵）
SORFTIME_MCP_URL=...
SORFTIME_MCP_API_KEY=...
MAIJIA_MCP_URL=...
MAIJIA_MCP_API_KEY=...

# 数据库
DATABASE_URL=sqlite:///./data/amazon_assistant.db
```

---

## 10. Docker Compose 结构

```yaml
services:
  frontend:
    build: ./frontend
    # nginx 同时 serve 静态文件 + 反代 /api
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    env_file: .env
    volumes:
      - ./data:/app/data    # SQLite 数据持久化
```

---

## 11. 前端语言规范

所有前端界面（按钮、标签、提示文字、错误信息、导航菜单）**全部使用中文**显示。

---

## 12. 不在第一期范围内

- 用户注册 / 邀请链接
- 用户权限细分
- 导出 PDF / Excel
