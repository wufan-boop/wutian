import {
  BookOutlined,
  LogoutOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  ConfigProvider,
  Form,
  Input,
  Layout,
  Menu,
  Row,
  Select,
  Spin,
  Table,
  Tabs,
  Typography,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import client from './api/client'
import { useAuthStore } from './store/auth'
import ProductResearch from './pages/ProductResearch'
import KeywordLibrary from './pages/KeywordLibrary'
import UserManagement from './pages/UserManagement'
import VOCAnalysis from './pages/VOCAnalysis'
import ListingCreator from './pages/ListingCreator'
import ListingOptimizer from './pages/ListingOptimizer'

const { Header, Content } = Layout
const { TextArea } = Input

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginPage() {
  const { message } = AntApp.useApp()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  async function handleLogin(values: { username: string; password: string }) {
    setSubmitting(true)
    try {
      const { data: t } = await client.post<{ access_token: string }>('/auth/login', values)
      const { data: u } = await client.get<{ id: number; username: string; role: string }>(
        '/auth/me',
        { headers: { Authorization: `Bearer ${t.access_token}` } },
      )
      setAuth(u, t.access_token)
    } catch {
      message.error('用户名或密码错误')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card title="Amazon 运营助手" style={{ width: 380 }}>
        <Form form={form} layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

// ─── Product Page ─────────────────────────────────────────────────────────────

function ProductPage() {
  return <ProductResearch />
}

// ─── Listing Page ─────────────────────────────────────────────────────────────

interface ListingHistory { id: number; product_name: string; market: string; result_json?: string; created_at: string }

function ListingGenerateTab() {
  const [form] = Form.useForm()
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(values: Record<string, unknown>) {
    setStreaming(true); setOutput('')
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/listing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(values),
        signal: abortRef.current.signal,
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
          if (p.text) setOutput((prev) => prev + p.text)
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setOutput((p) => p + '\n[请求失败]')
    } finally { setStreaming(false) }
  }

  return (
    <Row gutter={16}>
      <Col xs={24} md={8}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ market: 'US' }}>
          <Form.Item name="product_name" label="产品名称" rules={[{ required: true, message: '请输入产品名称' }]}>
            <Input placeholder="例如：MacBook Pro 14 Case" />
          </Form.Item>
          <Form.Item name="market" label="目标市场">
            <Select options={[
              { value: 'US', label: '🇺🇸 美国 (US)' },
              { value: 'UK', label: '🇬🇧 英国 (UK)' },
              { value: 'DE', label: '🇩🇪 德国 (DE)' },
              { value: 'JP', label: '🇯🇵 日本 (JP)' },
            ]} />
          </Form.Item>
          <Form.Item name="features" label="产品特点">
            <TextArea rows={3} placeholder="主要卖点，用逗号分隔" />
          </Form.Item>
          <Form.Item name="keywords" label="目标关键词">
            <TextArea rows={2} placeholder="SEO 关键词，用逗号分隔" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={streaming} block>生成 Listing</Button>
            {streaming && <Button onClick={() => abortRef.current?.abort()} block style={{ marginTop: 8 }}>停止</Button>}
          </Form.Item>
        </Form>
      </Col>
      <Col xs={24} md={16}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>生成结果</Typography.Text>
        <TextArea value={output} readOnly autoSize={{ minRows: 20, maxRows: 40 }} style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Col>
    </Row>
  )
}

function ListingHistoryTab() {
  const [data, setData] = useState<ListingHistory[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    client.get<ListingHistory[]>('/listing/history').then((r) => setData(r.data)).finally(() => setLoading(false))
  }, [])
  const cols = [
    { title: '产品名称', dataIndex: 'product_name', key: 'pn' },
    { title: '市场', dataIndex: 'market', key: 'm' },
    { title: '时间', dataIndex: 'created_at', key: 'ca', render: (v: string) => new Date(v).toLocaleString() },
  ]
  return <Table columns={cols} dataSource={data} loading={loading} rowKey="id" size="small" />
}

function ListingPage() {
  return (
    <Card>
      <Tabs items={[
        { key: 'g', label: '生成 Listing', children: <ListingGenerateTab /> },
        { key: 'h', label: '历史记录', children: <ListingHistoryTab /> },
      ]} />
    </Card>
  )
}


// ─── Knowledge Base ───────────────────────────────────────────────────────────

const KB_CATEGORIES = [
  { key: 'compliance', label: '合规红线' },
  { key: 'listing_rules', label: 'Listing规范' },
  { key: 'ad_rules', label: '广告规则' },
  { key: 'policy_updates', label: '新政速递' },
  { key: 'ops', label: '运维手册' },
]

interface KBItem { id: number; category: string; title: string; content: string; updated_at: string }

function KnowledgeBasePage() {
  const { message } = AntApp.useApp()
  const [items, setItems] = useState<KBItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('compliance')
  const [editingItem, setEditingItem] = useState<KBItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const r = await client.get<KBItem[]>('/knowledge')
      setItems(r.data)
    } catch { message.error('加载失败') }
    finally { setLoading(false) }
  }

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editingItem) {
        await client.put(`/knowledge/${editingItem.id}`, values)
      } else {
        await client.post('/knowledge', { ...values, category: activeCategory })
      }
      message.success('保存成功')
      setShowForm(false); setEditingItem(null); form.resetFields(); loadItems()
    } catch { message.error('保存失败') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    try {
      await client.delete(`/knowledge/${id}`)
      message.success('已删除'); loadItems()
    } catch { message.error('删除失败') }
  }

  function handleEdit(item: KBItem) {
    setEditingItem(item); form.setFieldsValue(item); setShowForm(true)
  }

  const filtered = items.filter(i => i.category === activeCategory)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Card
        title="政策知识库"
        extra={<Button type="primary" size="small" onClick={() => { setEditingItem(null); form.resetFields(); setShowForm(true) }}>+ 新增条目</Button>}
      >
        <Tabs activeKey={activeCategory} onChange={setActiveCategory}
          items={KB_CATEGORIES.map(c => ({
            key: c.key, label: c.label,
            children: (
              <div>
                {showForm && (
                  <Card size="small" style={{ marginBottom: 16, background: '#f8f8f8' }}>
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                      <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="例如：标题禁用词清单 2025" />
                      </Form.Item>
                      <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
                        <TextArea rows={6} placeholder="详细描述规则内容、违规案例、处理建议等" />
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="primary" htmlType="submit" loading={saving} style={{ marginRight: 8 }}>保存</Button>
                        <Button onClick={() => { setShowForm(false); setEditingItem(null) }}>取消</Button>
                      </Form.Item>
                    </Form>
                  </Card>
                )}
                {loading ? <Spin /> : filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无内容，点击右上角新增</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.map(item => (
                      <Card key={item.id} size="small"
                        extra={<div>
                          <Button type="link" size="small" onClick={() => handleEdit(item)}>编辑</Button>
                          <Button type="link" size="small" danger onClick={() => handleDelete(item.id)}>删除</Button>
                        </div>}
                      >
                        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>{item.title}</Typography.Text>
                        <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#444' }}>{item.content}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                          更新：{new Date(item.updated_at).toLocaleString()}
                        </Typography.Text>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )
          }))}
        />
      </Card>
    </div>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────

interface PromptItem { name: string; content: string }

function SettingsPage() {
  const { message } = AntApp.useApp()
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    client.get<PromptItem[]>('/prompts').then((r) => {
      const map: Record<string, string> = {}
      r.data.forEach((p) => { map[p.name] = p.content })
      setPrompts(map)
    })
  }, [])

  async function handleSave(name: string) {
    setSaving((s) => ({ ...s, [name]: true }))
    try {
      await client.put(`/prompts/${name}`, { content: prompts[name] })
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving((s) => ({ ...s, [name]: false }))
    }
  }

  const LABELS: Record<string, string> = {
    product_research: '选品调研提示词',
    voc_analysis: 'VOC分析提示词',
    listing: 'Listing 生成提示词',
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {Object.keys(LABELS).map((name) => (
        <Card key={name} title={LABELS[name]}
          extra={<Button type="primary" size="small" loading={saving[name]} onClick={() => handleSave(name)}>保存</Button>}
        >
          <TextArea
            value={prompts[name] ?? ''}
            onChange={(e) => setPrompts((p) => ({ ...p, [name]: e.target.value }))}
            autoSize={{ minRows: 12, maxRows: 30 }}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </Card>
      ))}
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header style={{
        display: 'flex', alignItems: 'center', padding: '0 24px',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        position: 'sticky', top: 0, zIndex: 100, height: 48,
      }}>
        <Typography.Text strong onClick={() => navigate('/product')}
          style={{ color: '#1d1d1f', fontSize: 15, whiteSpace: 'nowrap', marginRight: 32, cursor: 'pointer' }}>
          Amazon 运营助手
        </Typography.Text>
        <Menu mode="horizontal" selectedKeys={[location.pathname]}
          items={[
            { key: '/product', icon: <SearchOutlined />, label: '商品调研' },
            { key: '/keywords', icon: <UnorderedListOutlined />, label: '关键词库' },
            { key: '/voc', icon: <SearchOutlined />, label: 'VOC分析' },
            { key: '/listing', icon: <UnorderedListOutlined />, label: 'Listing 生成' },
            { key: '/optimizer', icon: <UnorderedListOutlined />, label: '文案优化' },
            ...(user?.role === 'admin' ? [{ key: '/knowledge', icon: <BookOutlined />, label: '政策知识库' }, { key: '/settings', icon: <SettingOutlined />, label: '提示词设置' }, { key: '/users', icon: <TeamOutlined />, label: '用户管理' }] : []),
          ]}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, border: 'none', background: 'transparent', lineHeight: '46px' }}
        />
        <Typography.Text style={{ color: '#6e6e73', fontSize: 13, marginRight: 8 }}>{user?.username}</Typography.Text>
        <Button type="text" icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login') }} style={{ color: '#6e6e73' }} />
      </Header>
      <Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/product" element={<ProductPage />} />
          <Route path="/users" element={<UserManagement />} />
              <Route path="/voc" element={<VOCAnalysis />} />
              <Route path="/keywords" element={<Card><KeywordLibrary /></Card>} />
          <Route path="/listing" element={<ListingCreator />} />
          <Route path="/optimizer" element={<ListingOptimizer />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<ProductPage />} />
        </Routes>
      </Content>
    </Layout>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppRoot() {
  const { token, user, setAuth, setInitialized, initialized, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) { setInitialized(); return }
    client.get<{ id: number; username: string; role: string }>('/auth/me')
      .then((r) => setAuth(r.data, token))
      .catch(() => { logout(); setInitialized() })
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!initialized) return
    if (!user) navigate('/login')
    else if (location.pathname === '/login') navigate('/product')
  }, [initialized, user, navigate])

  if (!initialized) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={user ? <AppShell /> : <LoginPage />} />
    </Routes>
  )
}

const appleTheme = {
  token: {
    colorPrimary: '#0071e3',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: 10, borderRadiusLG: 12,
    colorBgContainer: '#ffffff', colorBgLayout: '#f5f5f7',
    colorText: '#1d1d1f', colorTextSecondary: '#6e6e73',
    colorBorder: 'rgba(0,0,0,0.12)', fontSize: 14,
  },
  components: {
    Menu: { itemSelectedColor: '#0071e3', itemSelectedBg: 'transparent', horizontalItemSelectedColor: '#0071e3', activeBarHeight: 2 },
    Card: { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
    Button: { borderRadius: 8, fontWeight: 500 },
    Input: { borderRadius: 8 },
    Select: { borderRadius: 8 },
  },
}

export default function App() {
  return (
    <ConfigProvider theme={appleTheme}>
      <AntApp><AppRoot /></AntApp>
    </ConfigProvider>
  )
}
