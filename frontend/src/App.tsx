import {
  LogoutOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  ConfigProvider,
  Descriptions,
  Form,
  Input,
  InputNumber,
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

const { Header, Content } = Layout
const { TextArea } = Input

// ─── Login ───────────────────────────────────────────────────────────────────

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

// ─── Product Research ─────────────────────────────────────────────────────────

interface ProductHistory {
  id: number; keyword: string; selling_price?: number
  fba_fee?: number; cogs?: number; profit_margin?: number
  result_json?: string; created_at: string
}

function ProductResearchTab() {
  const [form] = Form.useForm()
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const [margin, setMargin] = useState<number | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(values: Record<string, unknown>) {
    setStreaming(true); setOutput(''); setMargin(null); setStatusMsg('')
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/product/research', {
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
          if (p.status) setStatusMsg(p.status)
          if (p.text) { setStatusMsg(''); setOutput((prev) => prev + p.text) }
          if (p.profit_margin != null) setMargin(p.profit_margin)
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setOutput((p) => p + '\n[请求失败]')
    } finally { setStreaming(false); setStatusMsg('') }
  }

  return (
    <Row gutter={16}>
      <Col xs={24} md={8}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ site: 'US' }}>
          <Form.Item name="keyword" label="关键词 / 品类" rules={[{ required: true, message: '请输入关键词' }]}>
            <Input placeholder="例如：yoga mat" />
          </Form.Item>
          <Form.Item name="site" label="目标站点">
            <Select options={[
              { value: 'US', label: '美国 (US)' },
              { value: 'UK', label: '英国 (UK)' },
              { value: 'DE', label: '德国 (DE)' },
              { value: 'JP', label: '日本 (JP)' },
              { value: 'CA', label: '加拿大 (CA)' },
            ]} />
          </Form.Item>
          <Form.Item name="selling_price" label="售价 ($)">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fba_fee" label="FBA 费用 ($)">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cogs" label="产品成本 ($)">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={streaming} block>开始调研</Button>
            {streaming && <Button onClick={() => abortRef.current?.abort()} block style={{ marginTop: 8 }}>停止</Button>}
          </Form.Item>
          {statusMsg && (
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>{statusMsg}</Typography.Text>
          )}
        </Form>
        {margin !== null && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="利润率">{margin}%</Descriptions.Item>
          </Descriptions>
        )}
      </Col>
      <Col xs={24} md={16}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>调研结果</Typography.Text>
        <TextArea value={output} readOnly autoSize={{ minRows: 20, maxRows: 40 }} style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Col>
    </Row>
  )
}

function ProductHistoryTab() {
  const [data, setData] = useState<ProductHistory[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { client.get<ProductHistory[]>('/product/history').then((r) => setData(r.data)).finally(() => setLoading(false)) }, [])
  const cols = [
    { title: '关键词', dataIndex: 'keyword', key: 'keyword' },
    { title: '售价', dataIndex: 'selling_price', key: 'sp', render: (v?: number) => v != null ? `$${v}` : '-' },
    { title: '利润率', dataIndex: 'profit_margin', key: 'pm', render: (v?: number) => v != null ? `${v}%` : '-' },
    { title: '时间', dataIndex: 'created_at', key: 'ca', render: (v: string) => new Date(v).toLocaleString() },
  ]
  return <Table columns={cols} dataSource={data} loading={loading} rowKey="id" size="small" />
}

function ProductPage() {
  return (
    <Card>
      <Tabs items={[
        { key: 'r', label: '商品调研', children: <ProductResearchTab /> },
        { key: 'h', label: '历史记录', children: <ProductHistoryTab /> },
      ]} />
    </Card>
  )
}

// ─── Listing Generation ───────────────────────────────────────────────────────

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
            <Input placeholder="例如：Bamboo Cutting Board" />
          </Form.Item>
          <Form.Item name="market" label="目标市场">
            <Select options={[{ value: 'US', label: '美国 (US)' }, { value: 'UK', label: '英国 (UK)' }, { value: 'DE', label: '德国 (DE)' }, { value: 'JP', label: '日本 (JP)' }]} />
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
  useEffect(() => { client.get<ListingHistory[]>('/listing/history').then((r) => setData(r.data)).finally(() => setLoading(false)) }, [])
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

// ─── Shell ────────────────────────────────────────────────────────────────────

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  function handleLogout() { logout(); navigate('/login') }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f7' }}>
      <Header style={{
        display: 'flex', alignItems: 'center', gap: 0, padding: '0 24px',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        position: 'sticky', top: 0, zIndex: 100,
        height: 48,
      }}>
        <Typography.Text
          strong
          onClick={() => navigate('/product')}
          style={{ color: '#1d1d1f', fontSize: 15, letterSpacing: '-0.3px', whiteSpace: 'nowrap', marginRight: 32, cursor: 'pointer' }}
        >
          Amazon 运营助手
        </Typography.Text>
        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={[
            { key: '/product', icon: <SearchOutlined />, label: '商品调研' },
            { key: '/listing', icon: <UnorderedListOutlined />, label: 'Listing 生成' },
          ]}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, border: 'none', background: 'transparent', lineHeight: '46px' }}
        />
        <Typography.Text style={{ color: '#6e6e73', fontSize: 13, whiteSpace: 'nowrap', marginRight: 8 }}>
          {user?.username}
        </Typography.Text>
        <Button
          type="text" icon={<LogoutOutlined />} onClick={handleLogout}
          style={{ color: '#6e6e73' }}
        />
      </Header>
      <Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/product" element={<ProductPage />} />
          <Route path="/listing" element={<ListingPage />} />
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

  if (!initialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

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
    borderRadius: 10,
    borderRadiusLG: 12,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f7',
    colorText: '#1d1d1f',
    colorTextSecondary: '#6e6e73',
    colorBorder: 'rgba(0,0,0,0.12)',
    colorBorderSecondary: 'rgba(0,0,0,0.06)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    boxShadowSecondary: '0 1px 4px rgba(0,0,0,0.04)',
    fontSize: 14,
  },
  components: {
    Menu: {
      itemSelectedColor: '#0071e3',
      itemSelectedBg: 'transparent',
      itemHoverColor: '#1d1d1f',
      itemHoverBg: 'transparent',
      horizontalItemSelectedColor: '#0071e3',
      activeBarHeight: 2,
    },
    Card: {
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    },
    Button: {
      borderRadius: 8,
      fontWeight: 500,
    },
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
    Table: {
      borderRadius: 10,
    },
  },
}

export default function App() {
  return (
    <ConfigProvider theme={appleTheme}>
      <AntApp>
        <AppRoot />
      </AntApp>
    </ConfigProvider>
  )
}
