import {
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FilterOutlined,
  LoadingOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  Divider,
  Statistic,
} from 'antd'
import { useEffect, useRef, useState } from 'react'

const { TextArea } = Input

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface KeywordItem {
  keyword: string
  search_volume: number
  category: string
  category_label: string
  quadrant: string
  quadrant_label: string
  coverage: string
  coverage_label: string
  source: string
  score: number
  level: number
  competition: number
  cpc_value: number
}

interface ProjectStats {
  total: number
  main: number
  potential: number
  redsea: number
  avoid: number
  gap_count: number
}

interface Project {
  project_id: string
  name: string
  keywords: KeywordItem[]
  stats: ProjectStats
  created_at: string
}

// ─── 颜色映射 ─────────────────────────────────────────────────────────────────

const QUADRANT_COLORS: Record<string, string> = {
  main: 'gold',
  potential: 'blue',
  redsea: 'red',
  avoid: 'default',
}

const CATEGORY_COLORS: Record<string, string> = {
  core: 'purple',
  function: 'blue',
  attribute: 'cyan',
  scene: 'green',
  audience: 'orange',
  brand: 'magenta',
  longtail: 'default',
}

const COVERAGE_COLORS: Record<string, string> = {
  mine: 'red',
  competitor: 'blue',
  gap: 'green',
  none: 'default',
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function KeywordLibrary() {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [currentStep, setCurrentStep] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [filterQuadrant, setFilterQuadrant] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterCoverage, setFilterCoverage] = useState<string>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // ─── 过滤关键词 ───────────────────────────────────────────────────────────

  const filteredKeywords = (project?.keywords || []).filter(kw => {
    if (filterQuadrant !== 'all' && kw.quadrant !== filterQuadrant) return false
    if (filterCategory !== 'all' && kw.category !== filterCategory) return false
    if (filterCoverage !== 'all' && kw.coverage !== filterCoverage) return false
    if (filterLevel !== 'all' && String(kw.level) !== filterLevel) return false
    if (searchText && !kw.keyword.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  // ─── 开始采集 ─────────────────────────────────────────────────────────────

  async function startBuild() {
    try {
      await form.validateFields()
    } catch {
      message.error('请填写竞品ASIN或核心关键词')
      return
    }

    const values = form.getFieldsValue()
    const asins = (values.asins || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
    const keywords = (values.keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean)

    if (!asins.length && !keywords.length) {
      message.error('请至少输入1个ASIN或1个关键词')
      return
    }

    setCurrentStep(1)
    setStreaming(true)
    setProject(null)
    setStatusMsg('')
    abortRef.current = new AbortController()

    const payload = {
      asins: asins.slice(0, 5),
      keywords: keywords.slice(0, 3),
      listing_text: values.listing_text || null,
      site: values.site || 'US',
      ai_model: values.ai_model || 'deepseek',
    }

    try {
      const res = await fetch('/api/keywords/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const p = JSON.parse(line.slice(6))
          if (p.type === 'status') {
            setStatusMsg(p.content)
          } else if (p.type === 'done') {
            setProject({
              project_id: p.project_id,
              name: keywords[0] || asins[0] || '关键词库',
              keywords: p.keywords,
              stats: p.stats,
              created_at: new Date().toISOString(),
            })
            setCurrentStep(2)
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        message.error('请求失败，请重试')
        setCurrentStep(0)
      }
    } finally {
      setStreaming(false)
      setStatusMsg('')
    }
  }

  // ─── 导出CSV ──────────────────────────────────────────────────────────────

  function exportCSV() {
    if (!project) return

    const headers = ['关键词', '搜索量', '分类', '竞争象限', '覆盖状态']
    const rows = filteredKeywords.map(kw => [
      kw.keyword,
      kw.search_volume,
      kw.category_label,
      kw.quadrant_label.replace(/[🟡🔵🔴⚠️]/g, '').trim(),
      kw.coverage_label.replace(/[🔴🔵🟢—]/g, '').trim(),
    ])

    const BOM = '\uFEFF'
    const csv = BOM + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `关键词库_${project.name}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  }

  // ─── 复制关键词 ───────────────────────────────────────────────────────────

  function copyKeywords() {
    const text = filteredKeywords.map(kw => kw.keyword).join(', ')
    navigator.clipboard.writeText(text)
    message.success(`已复制 ${filteredKeywords.length} 个关键词`)
  }

  // ─── 表格列定义 ───────────────────────────────────────────────────────────

  const columns = [
    {
      title: '关键词',
      dataIndex: 'keyword',
      key: 'keyword',
      render: (text: string) => (
        <Typography.Text copyable style={{ fontSize: 13 }}>{text}</Typography.Text>
      ),
    },
    {
      title: '搜索量',
      dataIndex: 'search_volume',
      key: 'search_volume',
      sorter: (a: KeywordItem, b: KeywordItem) => a.search_volume - b.search_volume,
      render: (v: number) => (
        <Typography.Text style={{ fontSize: 13 }}>
          {v > 0 ? v.toLocaleString() : '—'}
        </Typography.Text>
      ),
      width: 100,
    },
    {
      title: '分类',
      dataIndex: 'category_label',
      key: 'category',
      render: (text: string, record: KeywordItem) => (
        <Tag color={CATEGORY_COLORS[record.category]} style={{ fontSize: 12 }}>{text}</Tag>
      ),
      width: 90,
    },
    {
      title: '竞争象限',
      dataIndex: 'quadrant_label',
      key: 'quadrant',
      render: (text: string, record: KeywordItem) => (
        <Tag color={QUADRANT_COLORS[record.quadrant]} style={{ fontSize: 12 }}>{text}</Tag>
      ),
      width: 120,
    },
    {
      title: '评分',
      dataIndex: 'score',
      key: 'score',
      sorter: (a: KeywordItem, b: KeywordItem) => (a.score || 0) - (b.score || 0),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => {
        if (!v && v !== 0) return <Typography.Text type="secondary">—</Typography.Text>
        const color = v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}>
              {Math.round(v)}
            </div>
          </div>
        )
      },
      width: 70,
    },
    {
      title: '覆盖状态',
      dataIndex: 'coverage_label',
      key: 'coverage',
      render: (text: string, record: KeywordItem) => (
        record.coverage === 'none'
          ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>
          : <Tag color={COVERAGE_COLORS[record.coverage]} style={{ fontSize: 12 }}>{text}</Tag>
      ),
      width: 110,
    },
  ]

  // ─── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 0 24px' }}>

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
            items={[
              { title: '数据输入' },
              { title: '采集分析' },
              { title: '关键词库' },
            ]}
          />
          <div style={{ marginLeft: 24, display: 'flex', gap: 8 }}>
            {currentStep === 0 && (
              <Button type="primary" size="large" onClick={startBuild} loading={streaming} style={{ minWidth: 120 }}>
                开始采集
              </Button>
            )}
            {streaming && (
              <Button size="large" onClick={() => abortRef.current?.abort()}>停止</Button>
            )}
            {currentStep > 0 && !streaming && (
              <Button size="large" onClick={() => {
                setCurrentStep(0)
                setProject(null)
                form.resetFields()
              }}>
                重新采集
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 第1步：数据输入 */}
      {currentStep === 0 && (
        <Form form={form} layout="vertical">
          <Row gutter={24}>
            <Col span={12}>
              <Card style={{ borderRadius: 12, height: '100%' }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 16, fontSize: 14 }}>
                  核心输入
                </Typography.Text>

                <Form.Item name="site" label="目标市场" initialValue="US">
                  <Select options={[
                    { value: 'US', label: '🇺🇸 美国 (US)' },
                    { value: 'UK', label: '🇬🇧 英国 (UK)' },
                    { value: 'DE', label: '🇩🇪 德国 (DE)' },
                    { value: 'JP', label: '🇯🇵 日本 (JP)' },
                  ]} />
                </Form.Item>

                <Form.Item name="asins" label="竞品 ASIN（每行一个，最多5个）">
                  <TextArea
                    rows={4}
                    placeholder={"B0GSFNXCLM\nB0XXXXXXXXX\nB0YYYYYYYYY"}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                </Form.Item>

                <Form.Item name="keywords" label="核心关键词（逗号分隔，最多3个）">
                  <Input placeholder="例如：macbook neo case, macbook neo 13 case" />
                </Form.Item>

                <Form.Item name="ai_model" label="AI分类模型" initialValue="deepseek">
                  <Select options={[
                    { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
                    { value: 'claude', label: 'Claude Haiku（更精准）' },
                  ]} />
                </Form.Item>
              </Card>
            </Col>

            <Col span={12}>
              <Card style={{ borderRadius: 12, height: '100%' }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
                  自家 Listing 文本
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                  粘贴你的标题+五点+描述+Search Terms，系统自动标记三色覆盖：
                  <Tag color="red" style={{ marginLeft: 4, fontSize: 11 }}>🔴 我司已埋</Tag>
                  <Tag color="blue" style={{ fontSize: 11 }}>🔵 竞品已埋</Tag>
                  <Tag color="green" style={{ fontSize: 11 }}>🟢 机会缺口</Tag>
                </Typography.Text>
                <Form.Item name="listing_text" style={{ marginBottom: 0 }}>
                  <TextArea
                    rows={12}
                    placeholder="粘贴你的 Listing 标题 + 五点描述 + 产品描述 + Search Terms（全部拼一起可），系统会自动匹配"
                    style={{ fontSize: 13 }}
                  />
                </Form.Item>
              </Card>
            </Col>
          </Row>
        </Form>
      )}

      {/* 第2步：采集分析中 */}
      {currentStep === 1 && (
        <Card style={{ borderRadius: 12, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: 48 }}>
            {streaming ? (
              <>
                <Spin size="large" indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 20, fontSize: 14 }}>
                  {statusMsg || '正在采集数据...'}
                </Typography.Text>
              </>
            ) : (
              <>
                <CheckCircleFilled style={{ fontSize: 48, color: '#52c41a' }} />
                <Typography.Text style={{ display: 'block', marginTop: 16, fontSize: 14 }}>
                  采集完成
                </Typography.Text>
              </>
            )}
          </div>
        </Card>
      )}

      {/* 第3步：关键词库 */}
      {currentStep === 2 && project && (
        <>
          {/* 统计卡片 */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="关键词总数" value={project.stats.total} valueStyle={{ color: '#0071e3', fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="🟡 主推词" value={project.stats.main} valueStyle={{ color: '#d48806', fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="🔵 潜力词" value={project.stats.potential} valueStyle={{ color: '#0071e3', fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="🔴 红海词" value={project.stats.redsea} valueStyle={{ color: '#cf1322', fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="🟢 机会缺口" value={project.stats.gap_count} valueStyle={{ color: '#389e0d', fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="⚠️ 避坑词" value={project.stats.avoid} valueStyle={{ color: '#8c8c8c', fontSize: 22 }} />
              </Card>
            </Col>
          </Row>

          {/* 筛选区 */}
          <Card style={{ borderRadius: 12, marginBottom: 16 }}>
            <Row gutter={12} align="middle">
              <Col span={6}>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="搜索关键词..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  allowClear
                />
              </Col>
              <Col span={4}>
                <Select
                  style={{ width: '100%' }}
                  value={filterQuadrant}
                  onChange={setFilterQuadrant}
                  options={[
                    { value: 'all', label: '全部象限' },
                    { value: 'main', label: '🟡 主推词' },
                    { value: 'potential', label: '🔵 潜力词' },
                    { value: 'redsea', label: '🔴 红海词' },
                    { value: 'avoid', label: '⚠️ 避坑词' },
                  ]}
                />
              </Col>
              <Col span={4}>
                <Select
                  style={{ width: '100%' }}
                  value={filterCategory}
                  onChange={setFilterCategory}
                  options={[
                    { value: 'all', label: '全部分类' },
                    { value: 'core', label: '核心词' },
                    { value: 'function', label: '功能词' },
                    { value: 'attribute', label: '属性词' },
                    { value: 'scene', label: '场景词' },
                    { value: 'audience', label: '人群词' },
                    { value: 'brand', label: '品牌词' },
                    { value: 'longtail', label: '长尾词' },
                  ]}
                />
              </Col>
              <Col span={4}>
                <Select
                  style={{ width: '100%' }}
                  value={filterCoverage}
                  onChange={setFilterCoverage}
                  options={[
                    { value: 'all', label: '全部覆盖' },
                    { value: 'gap', label: '🟢 机会缺口' },
                    { value: 'competitor', label: '🔵 竞品已埋' },
                    { value: 'mine', label: '🔴 我司已埋' },
                  ]}
                />
              </Col>
              <Col span={4}>
                <Select
                  style={{ width: '100%' }}
                  value={filterLevel}
                  onChange={setFilterLevel}
                  options={[
                    { value: 'all', label: '全部层级' },
                    { value: '1', label: '1级' },
                    { value: '2', label: '2级' },
                    { value: '3', label: '3级' },
                    { value: '4', label: '4级' },
                  ]}
                />
              </Col>
              <Col span={6} style={{ textAlign: 'right' }}>
                <Space>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    显示 {filteredKeywords.length} 个
                  </Typography.Text>
                  <Button icon={<CopyOutlined />} onClick={copyKeywords}>
                    复制关键词
                  </Button>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={exportCSV}>
                    导出 Excel
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* 关键词表格 */}
          <Card style={{ borderRadius: 12 }}>
            <Table
              dataSource={filteredKeywords}
              columns={columns}
              rowKey="keyword"
              size="small"
              pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 个关键词` }}
              rowClassName={(record) => record.coverage === 'gap' ? 'keyword-gap-row' : ''}
            />
          </Card>

          {/* 底部导航 */}
          {/* 继续工作流 */}
          <div style={{
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fff7f0 100%)',
            border: '1px solid #e0e7ff',
            borderRadius: 12,
            padding: '14px 20px',
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              🔗 继续工作流：本关键词库会自动关联到下一步模块（同产品 ID），AI 直接用这里的 8 维分类选词 / 搭建广告架构
            </Typography.Text>
            <Space>
              <Button
                type="primary"
                size="middle"
                style={{ background: '#0071e3', borderColor: '#0071e3' }}
                onClick={() => {
                  const mainKeywords = project.keywords
                    .filter(k => k.quadrant === 'main' || k.quadrant === 'redsea')
                    .slice(0, 5)
                    .map(k => k.keyword)
                    .join(', ')
                  localStorage.setItem('keyword_library_result', mainKeywords)
                  window.location.href = '/listing'
                }}
              >
                🚀 → Listing 文案
              </Button>
              <Button
                size="middle"
                style={{ background: '#ff6b35', borderColor: '#ff6b35', color: '#fff' }}
                onClick={() => {
                  const allKeywords = project.keywords
                    .map(k => k.keyword)
                    .join(', ')
                  localStorage.setItem('keyword_library_result', allKeywords)
                  window.location.href = '/listing'
                }}
              >
                🎯 → 上架策略（含广告架构）
              </Button>
            </Space>
          </div>
        </>
      )}
    </div>
  )
}
