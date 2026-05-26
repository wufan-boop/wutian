import {
  CheckCircleFilled,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  Spin,
  Empty,
  Divider,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import client from '../api/client'

const { TextArea } = Input
const { Panel } = Collapse

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  mode: string
  keyword?: string
  status: 'pending' | 'analyzing' | 'done' | 'error'
  result?: string
  created_at: string
}

interface ResearchFormValues {
  mode: string
  site: string
  keyword?: string
  asin?: string
  asins?: string[]
  enable_longtail?: boolean
  selling_price?: number
  fba_fee?: number
  cogs?: number
  price_min?: number
  price_max?: number
  month_sales_min?: number
  weight_max_lb?: number
  budget_cny?: number
  team_size?: string
  supply_chain?: string
  exclude_categories?: string[]
  exclude_certification?: boolean
  exclude_seasonal?: boolean
  ai_model?: string
}

// ─── 选品模式配置 ─────────────────────────────────────────────────────────────

const MODES = [
  {
    key: 'keyword',
    icon: '🔍',
    title: '找方向',
    subtitle: '关键词 / 类目',
    desc: '输入关键词或类目，启用长尾扩展找细分蓝海',
    tip: '适合：有大致方向但没具体产品',
  },
  {
    key: 'validate',
    icon: '🎯',
    title: '验证产品',
    subtitle: '单个 ASIN',
    desc: '输入1个ASIN，生成单品深度报告',
    tip: '适合：看到一个产品想跟进',
  },
  {
    key: 'batch',
    icon: '⚡',
    title: '批量初筛',
    subtitle: '阈值条件',
    desc: '纯条件筛选，不调AI，速度最快',
    tip: '0 Token · 速度最快',
    highlight: true,
  },
  {
    key: 'potential',
    icon: '🚀',
    title: '潜力产品',
    subtitle: '系统推荐',
    desc: '发现上架<6个月但冲入Top20的黑马',
    tip: '适合：寻找新兴爆品机会',
  },
]

// ─── 步骤1：选品方式 ──────────────────────────────────────────────────────────

function Step1ModeSelect({
  form,
  selectedMode,
  onModeChange,
}: {
  form: ReturnType<typeof Form.useForm>[0]
  selectedMode: string
  onModeChange: (mode: string) => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0, marginBottom: 4 }}>
          1. 选品方式 & 输入
        </Typography.Title>
        <Typography.Text type="secondary">按你当前的工作目标选择模式</Typography.Text>
      </div>

      {/* 模式卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {MODES.map((m) => (
          <Col xs={24} sm={12} md={6} key={m.key}>
            <div
              onClick={() => { onModeChange(m.key); form.resetFields(['keyword', 'asin', 'asins', 'enable_longtail']) }}
              style={{
                padding: '16px',
                borderRadius: 12,
                border: `2px solid ${selectedMode === m.key ? '#0071e3' : 'rgba(0,0,0,0.1)'}`,
                background: selectedMode === m.key ? '#f0f7ff' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '100%',
                position: 'relative',
              }}
            >
              {m.highlight && (
                <Tag color="green" style={{ position: 'absolute', top: 8, right: 8, fontSize: 11 }}>
                  0 Token
                </Tag>
              )}
              <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
              <Typography.Text strong style={{ display: 'block', fontSize: 14, color: selectedMode === m.key ? '#0071e3' : '#1d1d1f' }}>
                {m.title}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                {m.subtitle}
              </Typography.Text>
              <Typography.Text style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 8 }}>
                {m.desc}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {m.tip}
              </Typography.Text>
              {selectedMode === m.key && (
                <div style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#0071e3', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <CheckCircleFilled style={{ color: '#fff', fontSize: 12 }} />
                </div>
              )}
            </div>
          </Col>
        ))}
      </Row>

      {/* 核心输入区 */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 16 }}>核心输入</Typography.Text>

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="site" label="目标市场" initialValue="US">
                <Select options={[
                  { value: 'US', label: '🇺🇸 美国 (US)' },
                  { value: 'UK', label: '🇬🇧 英国 (UK)' },
                  { value: 'DE', label: '🇩🇪 德国 (DE)' },
                  { value: 'JP', label: '🇯🇵 日本 (JP)' },
                  { value: 'CA', label: '🇨🇦 加拿大 (CA)' },
                ]} />
              </Form.Item>
            </Col>

            {selectedMode === 'keyword' && (
              <Col span={16}>
                <Form.Item name="keyword" label="关键词或类目方向" rules={[{ required: true, message: '请输入关键词' }]}>
                  <Input placeholder="例如：waterproof phone case / kitchen gadgets / MacBook case" size="large" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    关键词（产品大词、属性词、类目词都可以）。多个用逗号分隔，最多3个
                  </Typography.Text>
                </Form.Item>
                <Form.Item name="enable_longtail" valuePropName="checked" style={{ marginTop: 12 }}>
                  <Space>
                    <Switch size="small" />
                    <div>
                      <Typography.Text style={{ fontSize: 13 }}>🌊 启用长尾扩展（找蓝海）</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        系统会从你的关键词扩展长尾词，分析每个长尾词的供需 → 找高需求低竞争市场
                      </Typography.Text>
                    </div>
                  </Space>
                </Form.Item>
              </Col>
            )}

            {selectedMode === 'validate' && (
              <Col span={16}>
                <Form.Item name="asin" label="竞品 ASIN" rules={[{ required: true, message: '请输入ASIN' }]}>
                  <Input placeholder="B0XXXXXXXXX" size="large" />
                </Form.Item>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  系统将抓取每个ASIN的流量关键词和竞品关键词
                </Typography.Text>
              </Col>
            )}

            {selectedMode === 'batch' && (
              <Col span={16}>
                <Form.Item name="keyword" label="关键词（可选）">
                  <Input placeholder="例如：laptop case" />
                </Form.Item>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  批量初筛模式：纯阈值条件筛选 — 8套预设 + 类目均价自适应。不调AI · 0 token成本
                </Typography.Text>
              </Col>
            )}

            {selectedMode === 'potential' && (
              <Col span={16}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  🚀 潜力产品模式会自动发现平台上上架时间短但销量快速增长的黑马产品。
                  设置价格区间和站点后直接开始分析。
                </Typography.Text>
              </Col>
            )}
          </Row>

          {/* 成本计算 */}
          {!['batch', 'potential'].includes(selectedMode) && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>成本计算（可选）</Typography.Text>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="selling_price" label="售价 ($)">
                    <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="fba_fee" label="FBA 费用 ($)">
                    <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="cogs" label="产品成本 ($)">
                    <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {/* 筛选条件 */}
          <Collapse ghost style={{ marginTop: 8 }}>
            <Panel
              header={
                <Space>
                  <FilterOutlined style={{ color: '#6e6e73' }} />
                  <Typography.Text style={{ fontSize: 13, color: '#6e6e73' }}>筛选条件（可选）</Typography.Text>
                </Space>
              }
              key="filters"
            >
              <Row gutter={[16, 0]}>
                <Col span={8}>
                  <Form.Item name="price_min" label="最低售价 ($)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="15" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="price_max" label="最高售价 ($)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="50" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="month_sales_min" label="目标月销量">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="300" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="weight_max_lb" label="重量上限 (lb)">
                    <InputNumber min={0} precision={1} style={{ width: '100%' }} placeholder="2" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="budget_cny" label="首批备货预算（万RMB）">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="5" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="team_size" label="团队规模">
                    <Select allowClear placeholder="不限" options={[
                      { value: '1人', label: '1人（个人卖家）' },
                      { value: '3-5人', label: '3-5人（小团队）' },
                      { value: '10+', label: '10人以上' },
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item name="supply_chain" label="供应链优势">
                    <Input placeholder="例如：在义乌有合作工厂、家具品类供应链" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="exclude_categories" label="排除类目">
                    <Select mode="tags" placeholder="例如：服装、电子" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Space size={24}>
                    <Form.Item name="exclude_certification" valuePropName="checked" style={{ marginBottom: 0 }}>
                      <Checkbox>排除需认证类目（FDA/UL）</Checkbox>
                    </Form.Item>
                    <Form.Item name="exclude_seasonal" valuePropName="checked" style={{ marginBottom: 0 }}>
                      <Checkbox>排除强季节性产品</Checkbox>
                    </Form.Item>
                  </Space>
                </Col>
              </Row>
            </Panel>
          </Collapse>

          {/* AI模型 */}
          <Divider style={{ margin: '16px 0' }} />
          <Row gutter={16} align="middle">
            <Col span={8}>
              <Form.Item name="ai_model" label="AI 分析模型" initialValue="gemini">
                <Select options={[
                  { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
                  { value: 'gemini', label: 'Gemini 2.5 Flash（快速）' },
                  { value: 'claude', label: 'Claude Sonnet 4.6（深度分析）' },
                  { value: 'gpt4o', label: 'GPT-4o（待充值）' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>
    </div>
  )
}

// ─── 步骤2：数据分析 ──────────────────────────────────────────────────────────

function Step2Analysis({
  status,
  statusMsg,
}: {
  status: 'idle' | 'loading' | 'done' | 'error'
  statusMsg: string
}) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0, marginBottom: 4 }}>
          2. 数据采集 & AI 分析
        </Typography.Title>
        <Typography.Text type="secondary">Sorftime真实数据 + AI智能分析</Typography.Text>
      </div>

      <Card style={{ borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {status === 'idle' && (
          <Empty description="点击「开始分析」启动数据采集" />
        )}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 14 }}>
              {statusMsg || '正在获取市场数据...'}
            </Typography.Text>
          </div>
        )}
        {status === 'done' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <CheckCircleFilled style={{ fontSize: 40, color: '#52c41a' }} />
            <Typography.Text style={{ display: 'block', marginTop: 16, fontSize: 14 }}>
              数据分析完成，请查看选品报告
            </Typography.Text>
          </div>
        )}
        {status === 'error' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Typography.Text type="danger">分析失败，请重试</Typography.Text>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Markdown渲染 ─────────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const k = key++

    // 分隔线（跳过）
    if (line.match(/^[\s\-|:]+$/) && line.includes('-')) {
      continue
    }

    // 表格行
    if (line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean)
      if (cells.length > 1) {
        const nextLine = lines[i + 1] || ''
        const isHeader = nextLine.match(/^[\s\-|:]+$/)
        if (!inTable) {
          inTable = true
        }
        elements.push(
          <div key={k} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            background: isHeader ? '#EFF6FF' : 'transparent',
          }}>
            {cells.map((cell, ci) => (
              <div key={ci} style={{
                padding: '7px 10px', fontSize: 13,
                fontWeight: isHeader ? 600 : 400,
                color: '#1d1d1f',
                borderRight: ci < cells.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
              }}>
                {cell.replace(/\*\*/g, '')}
              </div>
            ))}
          </div>
        )
        continue
      }
    }

    inTable = false

    // **整行粗体标题**
    if (line.match(/^\*\*.+\*\*$/) || line.match(/^##\s/)) {
      const text = line.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^##\s/, '')
      elements.push(
        <div key={k} style={{ fontWeight: 700, fontSize: 14, marginTop: 20, marginBottom: 6, color: '#0071e3' }}>
          {text}
        </div>
      )
    }
    // 数字列表 1. xxx
    else if (line.match(/^\d+\.\s/)) {
      const parts = line.replace(/^\d+\.\s/, '').split(/(\*\*[^*]+\*\*)/)
      elements.push(
        <div key={k} style={{ fontSize: 13, lineHeight: 1.8, color: '#374151', paddingLeft: 16, marginBottom: 2 }}>
          <span style={{ color: '#0071e3', fontWeight: 600, marginRight: 6 }}>{line.match(/^\d+/)?.[0]}.</span>
          {parts.map((part, pi) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={pi} style={{ color: '#1d1d1f' }}>{part.slice(2, -2)}</strong>
              : part
          )}
        </div>
      )
    }
    // 普通行（含内联粗体）
    else if (line.trim()) {
      const parts = line.split(/(\*\*[^*]+\*\*)/)
      elements.push(
        <div key={k} style={{ fontSize: 13, lineHeight: 1.9, color: '#374151', marginBottom: 1 }}>
          {parts.map((part, pi) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={pi} style={{ color: '#1d1d1f' }}>{part.slice(2, -2)}</strong>
              : part
          )}
        </div>
      )
    }
    // 空行
    else {
      elements.push(<div key={k} style={{ height: 6 }} />)
    }
  }
  return elements
}

// ─── 步骤3：选品报告 ──────────────────────────────────────────────────────────

function Step3Report({
  result,
  margin,
  streaming,
}: {
  result: string
  margin: number | null
  streaming: boolean
}) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0, marginBottom: 4 }}>
          3. 选品报告
        </Typography.Title>
        <Typography.Text type="secondary">AI 生成的完整选品分析报告</Typography.Text>
      </div>

      {margin !== null && (
        <Descriptions bordered size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Descriptions.Item label="预估利润率">
            <Typography.Text strong style={{ color: margin > 25 ? '#52c41a' : margin > 15 ? '#faad14' : '#ff4d4f' }}>
              {margin}%
              {margin > 25 ? ' ✅ 可做' : margin > 15 ? ' ⚠️ 谨慎' : ' ❌ 不做'}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      )}

      <Card style={{ borderRadius: 12, padding: '8px 4px' }}>
        {!result && !streaming ? (
          <Empty description="报告生成后将在此显示" />
        ) : (
          <div style={{ padding: '8px 16px', minHeight: 400 }}>
            {renderMarkdown(result)}
            {streaming && <span style={{ color: '#0071e3' }}>▌</span>}
          </div>
        )}
      </Card>

      {/* AI 追问 */}
      {result && <AiChat context={result} />}
    </div>
  )
}

// ─── AI 追问组件 ──────────────────────────────────────────────────────────────

function AiChat({ context }: { context: string }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: '报告已生成，有什么问题可以继续问我' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('gemini-2.5-flash')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMsgs = [...messages, userMsg]
    setMessages([...newMsgs, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ messages: newMsgs, context, model }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const p = JSON.parse(line.slice(6))
          if (p.text) {
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: updated[updated.length - 1].content + p.text }
              return updated
            })
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: '[请求失败，请重试]' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card style={{ marginTop: 16, borderRadius: 12 }} title={
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong style={{ fontSize: 13 }}>AI 追问</Typography.Text>
        <Select value={model} onChange={setModel} size="small" style={{ width: 180 }} options={[
          { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
          { value: 'gemini', label: 'Gemini 2.5 Flash（快速）' },
          { value: 'claude', label: 'Claude Sonnet 4.6（深度分析）' },
          { value: 'gpt4o', label: 'GPT-4o（待充值）' },
        ]} />
      </div>
    }>
      <div style={{ height: 240, overflowY: 'auto', marginBottom: 12, padding: '0 4px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 10,
              background: msg.role === 'user' ? '#0071e3' : '#f5f5f7',
              color: msg.role === 'user' ? '#fff' : '#1d1d1f',
              fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content || (loading && i === messages.length - 1 ? '▋' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          value={input} onChange={(e) => setInput(e.target.value)}
          onPressEnter={send} placeholder="输入问题，按 Enter 发送..."
          disabled={loading}
        />
        <Button type="primary" onClick={send} loading={loading}>发送</Button>
      </div>
    </Card>
  )
}

// ─── 步骤4：导出&行动 ────────────────────────────────────────────────────────

function Step4Export({
  result,
  keyword,
  site,
  onNext,
}: {
  result: string
  keyword: string
  site: string
  onNext?: () => void
}) {
  const { message } = AntApp.useApp()
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const fileName = `选品报告_${keyword.replace(/\s+/g, '-') || 'report'}_${dateStr}`

  function downloadTxt() {
    const timeStr = new Date().toLocaleString('zh-CN')
    const content = `Amazon 选品调研报告\n生成时间：${timeStr}\n关键词：${keyword}\n站点：${site}\n${'='.repeat(40)}\n${result}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${fileName}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadExcel() {
    // 解析报告内容为行数据
    const lines = result.split('\n').filter(l => l.trim())
    const rows = [['Amazon 选品调研报告'], ['关键词', keyword], ['站点', site], ['生成时间', new Date().toLocaleString('zh-CN')], ['']]
    lines.forEach(line => {
      if (line.includes('|')) {
        const cells = line.split('|').map(c => c.trim()).filter(Boolean)
        if (cells.length > 1 && !line.match(/^[\s\-|:]+$/)) {
          rows.push(cells.map(c => c.replace(/\*\*/g, '')))
        }
      } else {
        rows.push([line.replace(/\*\*/g, '')])
      }
    })

    // 生成CSV（Excel可直接打开）
    const csv = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${fileName}.csv`; a.click()
    URL.revokeObjectURL(url)
    message.success('Excel文件已下载，用Excel打开即可')
  }

  function copyAll() {
    navigator.clipboard.writeText(result)
    message.success('已复制到剪贴板')
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0, marginBottom: 4 }}>
          4. 导出 & 行动
        </Typography.Title>
        <Typography.Text type="secondary">下载报告或进入下一步</Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card hoverable style={{ borderRadius: 12, textAlign: 'center', cursor: 'pointer' }} onClick={downloadTxt}>
            <FileTextOutlined style={{ fontSize: 32, color: '#0071e3', marginBottom: 8 }} />
            <Typography.Text strong style={{ display: 'block' }}>下载 TXT</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>纯文本，可直接粘贴</Typography.Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable style={{ borderRadius: 12, textAlign: 'center', cursor: 'pointer' }} onClick={downloadExcel}>
            <DownloadOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
            <Typography.Text strong style={{ display: 'block' }}>下载 Excel</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>CSV格式，Excel可打开</Typography.Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card
            hoverable
            style={{ borderRadius: 12, textAlign: 'center', cursor: 'pointer', opacity: result ? 1 : 0.5 }}
            onClick={copyAll}
          >
            <DownloadOutlined style={{ fontSize: 32, color: '#faad14', marginBottom: 8 }} />
            <Typography.Text strong style={{ display: 'block' }}>复制全部</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>一键复制到剪贴板</Typography.Text>
          </Card>
        </Col>
        {onNext && (
          <Col span={6}>
            <Card
              hoverable
              style={{ borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: '#f0f7ff', border: '2px solid #0071e3' }}
              onClick={onNext}
            >
              <RightOutlined style={{ fontSize: 32, color: '#0071e3', marginBottom: 8 }} />
              <Typography.Text strong style={{ display: 'block', color: '#0071e3' }}>下一步：关键词库</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>基于选品结果构建关键词库</Typography.Text>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function ProductResearch() {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedMode, setSelectedMode] = useState('keyword')
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [result, setResult] = useState('')
  const [margin, setMargin] = useState<number | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function createNewProject() {
    const id = `proj_${Date.now()}`
    const newProject: Project = {
      id,
      name: '新建选品',
      mode: 'keyword',
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    setProjects((prev) => [newProject, ...prev])
    setActiveProject(id)
    setCurrentStep(0)
    setSelectedMode('keyword')
    setResult('')
    setMargin(null)
    setAnalysisStatus('idle')
    form.resetFields()
  }

  function deleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (activeProject === id) {
      setActiveProject(null)
      setResult('')
      setCurrentStep(0)
    }
  }

  function selectProject(proj: Project) {
    setActiveProject(proj.id)
    setResult(proj.result || '')
    setCurrentStep(proj.status === 'done' ? 2 : 0)
    setAnalysisStatus(proj.status === 'done' ? 'done' : 'idle')
    setSelectedMode(proj.mode)
  }

  async function startAnalysis() {
    try {
      await form.validateFields()
    } catch {
      message.error('请填写必填项')
      return
    }

    const values = form.getFieldsValue() as ResearchFormValues
    const keyword = values.keyword || (values.asins?.[0]) || values.asin || ''

    // 更新项目名称
    setProjects((prev) => prev.map((p) =>
      p.id === activeProject
        ? { ...p, name: keyword || '新建选品', mode: selectedMode, status: 'analyzing' }
        : p
    ))

    setCurrentStep(1)
    setAnalysisStatus('loading')
    setResult('')
    setMargin(null)
    setStreaming(true)
    abortRef.current = new AbortController()

    // 把asins对象转成数组（Ant Design Form嵌套字段问题）
    if (values.asins && !Array.isArray(values.asins)) {
      values.asins = Object.values(values.asins).filter(Boolean) as string[]
    }
    const payload = { ...values, mode: selectedMode }
    console.log("DEBUG payload:", JSON.stringify(payload))

    try {
      const res = await fetch('/api/product/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let fullResult = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const p = JSON.parse(line.slice(6))
          if (p.status) setStatusMsg(p.status)
          if (p.text) {
            setStatusMsg('')
            fullResult += p.text
            setResult(fullResult)
            // 有内容了就跳到报告步骤
            if (currentStep === 1) setCurrentStep(2)
          }
          if (p.profit_margin != null) setMargin(p.profit_margin)
          if (p.done) {
            setAnalysisStatus('done')
            setProjects((prev) => prev.map((proj) =>
              proj.id === activeProject
                ? { ...proj, status: 'done', result: fullResult }
                : proj
            ))
          }
        }
      }

      setCurrentStep(2)
      setAnalysisStatus('done')
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setAnalysisStatus('error')
        setProjects((prev) => prev.map((p) =>
          p.id === activeProject ? { ...p, status: 'error' } : p
        ))
      }
    } finally {
      setStreaming(false)
      setStatusMsg('')
    }
  }

  const keyword = form.getFieldValue('keyword') || ''
  const site = form.getFieldValue('site') || 'US'

  const steps = [
    { title: '选品方式' },
    { title: '数据分析' },
    { title: '选品报告' },
    { title: '导出&行动' },
  ]

  // 初始化时自动创建一个项目
  useEffect(() => {
    if (!activeProject) {
      const id = `proj_${Date.now()}`
      setActiveProject(id)
    }
  }, [])

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* 顶部步骤导航 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#f5f5f7', padding: '16px 0 12px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Steps
            current={currentStep}
            size="small"
            style={{ flex: 1 }}
            items={steps.map((s, i) => ({
              title: s.title,
              status: i < currentStep ? 'finish' : i === currentStep ? 'process' : 'wait',
              onClick: () => {
                if (i < currentStep || (i === 3 && analysisStatus === 'done')) {
                  setCurrentStep(i)
                }
              },
              style: { cursor: i < currentStep ? 'pointer' : 'default' },
            }))}
          />
          <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
            {currentStep === 0 && (
              <Button
                type="primary" size="large"
                onClick={startAnalysis}
                loading={streaming}
                style={{ minWidth: 120 }}
              >
                {selectedMode === 'batch' ? '⚡ 开始初筛' : '开始分析'}
              </Button>
            )}
            {streaming && (
              <Button onClick={() => abortRef.current?.abort()}>停止</Button>
            )}
            {currentStep === 0 && (
              <Button
                size="large"
                icon={<PlusOutlined />}
                onClick={() => {
                  setCurrentStep(0)
                  setSelectedMode('keyword')
                  setResult('')
                  setMargin(null)
                  setAnalysisStatus('idle')
                  form.resetFields()
                }}
              >
                重置
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 步骤内容 */}
      {currentStep === 0 && (
        <Step1ModeSelect form={form} selectedMode={selectedMode} onModeChange={setSelectedMode} />
      )}
      {currentStep === 1 && (
        <Step2Analysis status={analysisStatus} statusMsg={statusMsg} />
      )}
      {currentStep === 2 && (
        <Step3Report result={result} margin={margin} streaming={streaming} />
      )}
      {currentStep === 3 && (
        <Step4Export result={result} keyword={keyword} site={site} />
      )}

      {/* 底部导航 */}
      {currentStep > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, position: 'sticky', bottom: 16, background: '#f5f5f7', padding: '12px 0', zIndex: 10 }}>
          <Button size="large" onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}>
            ← 上一步
          </Button>
          {currentStep < 3 && analysisStatus === 'done' && (
            <Button type="primary" size="large" onClick={() => setCurrentStep((s) => Math.min(3, s + 1))}>
              下一步 →
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
