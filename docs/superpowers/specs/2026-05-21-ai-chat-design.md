# AI 对话框 设计文档

**日期：** 2026-05-21
**状态：** 已审核
**模块：** 选品调研结果 → AI 对话

---

## 1. 功能目标

在选品调研结果生成完毕后，页面下方自动出现一个 AI 对话框。用户可以就本次调研数据提问（如数据准确性、月销量计算逻辑、竞品解读等），AI 以调研结果为上下文作答。支持切换大模型。

---

## 2. 界面设计

位置：`ProductResearchTab` 右侧结果区域（Col span=16）的 TextArea 下方，仅当 `output` 非空时显示。

```
┌─────────────────────────────────────────┐
│  调研结果 TextArea（现有）               │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  AI 对话                 [Gemini 2.5 ▼] │
│  ┌──────────────────────────────────┐   │
│  │ 🤖 已读取调研结果，有什么问题？   │   │
│  │         [用户] 这月销量准确吗？   │   │
│  │ 🤖 月销量数据来自 Sorftime...    │   │
│  └──────────────────────────────────┘   │
│  [ 输入问题...                 ] [发送]  │
└─────────────────────────────────────────┘
```

- 对话框默认高度 300px，消息区可滚动
- 用户消息：右对齐，蓝色气泡
- AI 消息：左对齐，灰色气泡，流式逐字输出
- 每次新调研完成，对话历史清空，AI 重新读取新结果

---

## 3. 模型支持

| 模型标识 | 名称 | SDK |
|---|---|---|
| `gemini-2.5-flash` | Gemini 2.5 Flash | google-genai（已有） |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | anthropic（需安装） |
| `gpt-4o` | ChatGPT GPT-4o | openai（需安装） |

模型选择器：小 Select 组件，默认 Gemini 2.5 Flash，放在对话框右上角。

---

## 4. 后端

### 新增端点

```
POST /api/chat/message
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [{"role": "user"|"assistant", "content": "string"}],
  "context": "string",   // 调研结果原文，注入 system prompt
  "model": "gemini-2.5-flash" | "claude-sonnet-4-6"
}

Response: text/event-stream
data: {"text": "..."}
data: {"done": true}
```

### 新增文件

- `backend/app/api/chat.py` — 路由，解析请求，调用 service，SSE 返回
- `backend/app/services/chat_service.py` — 按 model 分发：Gemini 用 google-genai，Claude 用 anthropic SDK

### System Prompt

```
你是亚马逊运营数据分析助手。用户刚完成了一次选品调研，调研结果如下：

{context}

请基于以上数据回答用户的问题。如果问题超出调研数据范围，如实说明。回答简洁、专业。
```

### 配置

在 `backend/app/core/config.py` 新增：
```python
anthropic_api_key: str = ""
openai_api_key: str = ""
```

在 `backend/.env` 新增：
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## 5. 前端

在 `frontend/src/App.tsx` 的 `ProductResearchTab` 中：

**新增状态：**
```typescript
const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([])
const [chatInput, setChatInput] = useState('')
const [chatModel, setChatModel] = useState('gemini-2.5-flash')
const [chatStreaming, setChatStreaming] = useState(false)
```

**触发逻辑：** 当 `output` 从空变为非空时，自动追加 AI 欢迎语："已读取调研结果，请问有什么问题？"

**清空逻辑：** 每次点击"开始调研"时，`setChatMessages([])` 清空历史。

**发送逻辑：** fetch `/api/chat/message`，SSE 流式更新最后一条 assistant 消息。

---

## 6. 报告下载

调研结果生成后，在结果区域右上角显示"下载报告"按钮，点击即下载 `.txt` 文件。

**文件内容：**
```
Amazon 选品调研报告
生成时间：2026-05-21 14:30
关键词：yoga mat
站点：US
========================================
[调研结果原文]
```

**实现方式：** 纯前端，无需后端接口。用 `Blob` + `URL.createObjectURL` 在浏览器端生成并触发下载，文件名格式：`调研报告_yoga-mat_20260521.txt`。

**触发条件：** `output` 非空时按钮才可点击（否则置灰）。

---

## 7. 不在本期范围

- 对话历史持久化到数据库
- Listing 生成页面也加对话框
- 更多模型（Llama、Deepseek 等本地部署模型）
