import {
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  LoadingOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'

// ── 描述 HTML → 纯文本 / 分段 工具 ──
const descToPlainText = (html: string = ''): string =>
  (html || '')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const descToSections = (html: string = ''): string[] =>
  descToPlainText(html).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)


const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const STEPS = ['1. 产品输入', '2. 数据分析', '3. 文案生成', '4. 图片策略', '5. 导出']

const AI_MODELS = [
  { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
  { value: 'gemini', label: 'Gemini 2.5 Flash（快速）' },
  { value: 'claude', label: 'Claude Sonnet 4.6（深度分析）' },
  { value: 'gpt4o', label: 'GPT-4o（待充值）' },
]

interface ListingInput {
  asin: string
  competitor_asins: string
  brand_name: string
  product_name: string
  product_category: string
  site: string
  product_description: string
  differentiation: string
  core_keywords: string
  voc_data: string
  ai_model: string
}

interface ListingCopy {
  title: string
  title_a?: string
  title_b?: string
  bullets: string[]
  description: string
  search_terms: string
  qa_checklist?: Record<string, string>
  keyword_coverage_table?: Array<{keyword: string, volume: string, title: boolean, bullets: boolean, description: boolean, st: boolean}>
  next_steps?: string[]
}

interface AnalysisData {
  cosmo: any
  voc_insights: any
  market: any
}

export default function ListingCreator() {
  const { message } = AntApp.useApp()
  const [currentStep, setCurrentStep] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [analysisTab, setAnalysisTab] = useState('cosmo')
  const [listing, setListing] = useState<ListingCopy | null>(null)
  const [imageStrategy, setImageStrategy] = useState<string[]>([])
  const [editingListing, setEditingListing] = useState<ListingCopy | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const [input, setInput] = useState<ListingInput>({
    asin: '',
    competitor_asins: '',
    brand_name: '',
    product_name: '',
    product_category: '',
    site: 'US',
    product_description: '',
    differentiation: '',
    core_keywords: '',
    voc_data: localStorage.getItem('voc_listing_data') || '',
    ai_model: 'deepseek',
  })

  // ─── 第2步：数据分析 ───────────────────────────────────────────────────────
  async function startAnalysis() {
    setAnalyzing(true)
    setStatusMsg('正在采集Sorftime数据...')
    try {
      const res = await fetch('/api/listing/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          asin: input.asin.trim(),
          competitor_asins: input.competitor_asins.split(',').map(s => s.trim()).filter(Boolean),
          core_keywords: input.core_keywords,
          product_name: input.product_name,
          product_description: input.product_description,
          differentiation: input.differentiation,
          site: input.site,
          voc_data: input.voc_data,
          ai_model: input.ai_model,
        }),
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
          if (p.type === 'status') setStatusMsg(p.content)
          else if (p.type === 'done') {
            setAnalysisData(p.analysis)
          } else if (p.type === 'error') {
            message.error(p.content)
            setCurrentStep(0)
          }
        }
      }
    } catch {
      message.error('分析失败，请重试')
    } finally {
      setAnalyzing(false)
      setStatusMsg('')
    }
  }

  // ─── 第3步：文案生成 ───────────────────────────────────────────────────────
  async function generateCopy() {
    setGenerating(true)
    setStatusMsg('AI正在生成Listing文案...')
    try {
      const res = await fetch('/api/listing/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          input,
          analysis: analysisData,
          ai_model: input.ai_model,
        }),
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
          if (p.type === 'status') setStatusMsg(p.content)
          else if (p.type === 'done') {
            const listing = p.listing
            if (listing.title_a && !listing.title) {
              listing.title = listing.title_a
            }
            setListing(listing)
            setEditingListing(listing)
          } else if (p.type === 'error') {
            message.error(p.content)
          }
        }
      }
    } catch {
      message.error('生成失败，请重试')
    } finally {
      setGenerating(false)
      setStatusMsg('')
    }
  }

  // ─── 第4步：图片策略 ───────────────────────────────────────────────────────
  async function generateImageStrategy() {
    setGenerating(true)
    try {
      const res = await fetch('/api/listing/image-strategy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ input, analysis: analysisData, listing, ai_model: input.ai_model }),
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
          if (p.type === 'done') {
            setImageStrategy(p.strategy)
            setCurrentStep(4)
          }
        }
      }
    } catch {
      message.error('生成失败')
    } finally {
      setGenerating(false)
    }
  }

  // ─── 导出 ──────────────────────────────────────────────────────────────────
  function exportTXT() {
    if (!editingListing) return
    const content = [
      `Listing文案 - ${input.product_name || input.asin}`,
      `生成时间: ${new Date().toLocaleString()}`,
      '='.repeat(60),
      '',
      '【标题】',
      editingListing.title,
      '',
      '【五点描述】',
      ...(editingListing.bullets || []).map((b, i) => `${i+1}. ${b}`),
      '',
      '【产品描述】',
      editingListing.description,
      '',
      '【Search Terms】',
      editingListing.search_terms,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Listing_${input.asin || input.product_name}_${new Date().toISOString().slice(0,10)}.txt`
    a.click()
    message.success('导出成功')
  }

  function copyAll() {
    if (!editingListing) return
    const text = `【标题】\n${editingListing.title}\n\n【五点】\n${(editingListing.bullets||[]).join('\n')}\n\n【描述】\n${editingListing.description}\n\n【ST】\n${editingListing.search_terms}`
    navigator.clipboard.writeText(text)
    message.success('已复制全部文案')
  }

  function goTo(i: number) {
    if (i === 0) { setCurrentStep(0); return }
    if (i === 1 && input.product_name) { setCurrentStep(1); return }
    if (i === 2 && analysisData) { setCurrentStep(2); return }
    if (i === 3 && listing) { setCurrentStep(3); return }
    if (i === 4 && listing) { setCurrentStep(4); return }
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)', background: '#f5f5f7' }}>

      {/* 左侧导航 */}
      <div style={{ width: 200, background: '#fff', borderRight: '1px solid #e8e8e8', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13, color: '#0071e3' }}>📝 Listing 全案</Text>
        </div>
        {STEPS.map((label, i) => (
          <div key={i} onClick={() => goTo(i)} style={{
            padding: '10px 20px', cursor: 'pointer',
            background: currentStep === i ? '#e6f4ff' : 'transparent',
            borderLeft: currentStep === i ? '3px solid #0071e3' : '3px solid transparent',
            color: currentStep === i ? '#0071e3' : i <= currentStep ? '#333' : '#bbb',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              border: `1.5px solid ${currentStep === i ? '#0071e3' : i < currentStep ? '#52c41a' : '#d9d9d9'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, flexShrink: 0,
              background: i < currentStep ? '#52c41a' : 'transparent',
              color: i < currentStep ? '#fff' : 'inherit',
            }}>
              {i < currentStep ? '✓' : ''}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>

        {/* 顶部 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 24 }}>
          <Title level={4} style={{ margin: 0 }}>Listing Creator</Title>
          <div style={{ display: 'flex', gap: 20 }}>
            {['1.输入', '2.分析', '3.文案', '4.图片策略', '5.导出'].map((label, i) => (
              <Text key={i} onClick={() => goTo(i)} style={{
                fontSize: 13, cursor: 'pointer',
                color: currentStep === i ? '#0071e3' : '#bbb',
                fontWeight: currentStep === i ? 600 : 400,
              }}>{label}</Text>
            ))}
          </div>
        </div>

        {/* ─── 第1步：产品输入 ─── */}
        {currentStep === 0 && (
          <div style={{ maxWidth: 800 }}>
            <Title level={4}>1. 产品信息输入</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>填写产品信息，上传产品图片和辅助数据文件</Text>

            {/* 导入VOC数据 */}
            {input.voc_data && (
              <Alert
                message="✅ 已导入VOC分析数据，AI将基于真实评论优化文案"
                type="success" showIcon style={{ marginBottom: 16 }}
                action={<Button size="small" onClick={() => setInput(p => ({ ...p, voc_data: '' }))}>清除</Button>}
              />
            )}

            <Row gutter={24}>
              <Col span={12}>
                <Card style={{ borderRadius: 12, marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12 }}>基本信息</Text>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>品牌名称</Text>
                    <Input placeholder="例：Essential Aura" value={input.brand_name} onChange={e => setInput(p => ({ ...p, brand_name: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>产品名称 *</Text>
                    <Input placeholder="例：Natural Bristle Body Brush" value={input.product_name} onChange={e => setInput(p => ({ ...p, product_name: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>产品品类</Text>
                    <Input placeholder="例：MacBook Case" value={input.product_category} onChange={e => setInput(p => ({ ...p, product_category: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 13 }}>目标市场</Text>
                    <Select value={input.site} onChange={v => setInput(p => ({ ...p, site: v }))} style={{ width: '100%', marginTop: 4 }}
                      options={[
                        { value: 'US', label: '🇺🇸 美国 (US)' },
                        { value: 'UK', label: '🇬🇧 英国 (UK)' },
                        { value: 'DE', label: '🇩🇪 德国 (DE)' },
                        { value: 'JP', label: '🇯🇵 日本 (JP)' },
                      ]}
                    />
                  </div>
                </Card>

                <Card style={{ borderRadius: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12 }}>关键词与竞品</Text>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>核心关键词</Text>
                    <Input placeholder="例：body brush, dry brushing" value={input.core_keywords} onChange={e => setInput(p => ({ ...p, core_keywords: e.target.value }))} style={{ marginTop: 4 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>最多写3个核心词，系统自动查询关键词数据</Text>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>产品ASIN（自家/参考）</Text>
                    <Input placeholder="B0XXXXXXXXXX" value={input.asin} onChange={e => setInput(p => ({ ...p, asin: e.target.value }))} style={{ marginTop: 4, fontFamily: 'monospace' }} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 13 }}>竞品 ASIN（最多3个）</Text>
                    <Input placeholder="B0AAAA, B0BBBB" value={input.competitor_asins} onChange={e => setInput(p => ({ ...p, competitor_asins: e.target.value }))} style={{ marginTop: 4, fontFamily: 'monospace' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>最多写3个ASIN，系统采集竞品详情、评论和关键词数据</Text>
                  </div>
                </Card>
              </Col>

              <Col span={12}>
                <Card style={{ borderRadius: 12, marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12 }}>产品描述</Text>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>产品描述 *</Text>
                    <TextArea rows={4} placeholder="产品的详细描述，材质、尺寸、功能特点..." value={input.product_description} onChange={e => setInput(p => ({ ...p, product_description: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 13 }}>差异化卖点</Text>
                    <TextArea rows={3} placeholder="相比竞品的独特优势..." value={input.differentiation} onChange={e => setInput(p => ({ ...p, differentiation: e.target.value }))} style={{ marginTop: 4 }} />
                  </div>
                </Card>

                <Card style={{ borderRadius: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12 }}>辅助数据（可选）</Text>
                  <div style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13 }}>已有VOC报告（粘贴文本）</Text>
                    <TextArea rows={4} placeholder="粘贴VOC分析报告内容，或从VOC模块导入" value={input.voc_data} onChange={e => setInput(p => ({ ...p, voc_data: e.target.value }))} style={{ marginTop: 4, fontSize: 12 }} />
                  </div>
                </Card>
              </Col>
            </Row>

            <div style={{ marginTop: 20 }}>
              {!input.product_name && <Alert message="请填写产品名称" type="warning" showIcon style={{ marginBottom: 12 }} />}
              <Button type="primary" size="large" disabled={!input.product_name} onClick={() => setCurrentStep(1)}>
                下一步：数据分析 →
              </Button>
            </div>
          </div>
        )}

        {/* ─── 第2步：数据分析 ─── */}
        {currentStep === 1 && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <Title level={4} style={{ margin: 0 }}>2. 数据分析</Title>
                <Text type="secondary">Sorftime真实数据 + VOC + AI智能分析</Text>
              </div>
              <Space>
                <Select value={input.ai_model} onChange={v => setInput(p => ({ ...p, ai_model: v }))} style={{ width: 220 }} options={AI_MODELS} />
                <Button type="primary" size="large" icon={analyzing ? <LoadingOutlined /> : <RocketOutlined />} loading={analyzing} onClick={startAnalysis}>
                  {analyzing ? statusMsg || '分析中...' : '开始分析'}
                </Button>
              </Space>
            </div>

            {analysisData && (
              <Tabs activeKey={analysisTab} onChange={setAnalysisTab} items={[
                {
                  key: 'cosmo', label: 'COSMO分析',
                  children: (
                    <Card style={{ borderRadius: 12 }}>
                      {analysisData.cosmo?.product_positioning && (
                        <Alert message={`产品定位：${analysisData.cosmo.product_positioning}`} type="info" showIcon style={{ marginBottom: 16 }} />
                      )}
                      <Row gutter={16}>
                        <Col span={12}>
                          <Title level={5}>产品侧</Title>
                          {(analysisData.cosmo?.product_side || []).map((item: any, i: number) => (
                            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8, padding: '8px 12px', background: '#f5f5f5', borderRadius: 8 }}>
                              <Tag color="blue" style={{ flexShrink: 0 }}>{item.dimension}</Tag>
                              <Text style={{ fontSize: 13 }}>{item.content}</Text>
                              <Tag color={item.confidence === '强' ? 'green' : 'orange'} style={{ flexShrink: 0, marginLeft: 'auto' }}>{item.confidence}</Tag>
                            </div>
                          ))}
                        </Col>
                        <Col span={12}>
                          <Title level={5}>用户侧</Title>
                          {(analysisData.cosmo?.user_side || []).map((item: any, i: number) => (
                            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8, padding: '8px 12px', background: '#f5f5f5', borderRadius: 8 }}>
                              <Tag color="purple" style={{ flexShrink: 0 }}>{item.dimension}</Tag>
                              <Text style={{ fontSize: 13 }}>{item.content}</Text>
                              <Tag color={item.confidence === '强' ? 'green' : 'orange'} style={{ flexShrink: 0, marginLeft: 'auto' }}>{item.confidence}</Tag>
                            </div>
                          ))}
                        </Col>
                      </Row>
                      {analysisData.cosmo?.differentiation_opportunities && (
                        <div style={{ marginTop: 16 }}>
                          <Title level={5}>差异化机会</Title>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {analysisData.cosmo.differentiation_opportunities.map((d: string, i: number) => (
                              <Tag key={i} color="cyan">{d}</Tag>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysisData.cosmo?.keyword_groups && (
                        <div style={{ marginTop: 16 }}>
                          <Title level={5}>关键词分组</Title>
                          <Row gutter={16}>
                            {Object.entries(analysisData.cosmo.keyword_groups).map(([group, words]: [string, any]) => (
                              <Col span={8} key={group}>
                                <Text strong style={{ display: 'block', marginBottom: 8 }}>{group}</Text>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {(words || []).map((w: string, i: number) => <Tag key={i}>{w}</Tag>)}
                                </div>
                              </Col>
                            ))}
                          </Row>
                        </div>
                      )}
                    </Card>
                  )
                },
                {
                  key: 'voc', label: 'VOC洞察',
                  children: (
                    <Card style={{ borderRadius: 12 }}>
                      {analysisData.voc_insights?.warning && (
                        <Alert message={analysisData.voc_insights.warning} type="warning" showIcon style={{ marginBottom: 16 }} />
                      )}
                      <Row gutter={16}>
                        <Col span={12}>
                          <Title level={5} style={{ color: '#52c41a' }}>正面评论主题</Title>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            {(analysisData.voc_insights?.positive_themes || []).map((t: any, i: number) => (
                              <Card key={i} size="small" style={{ borderLeft: '3px solid #52c41a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Text strong>{t.name}</Text>
                                  <Text type="secondary">{t.percentage}</Text>
                                </div>
                                <Text style={{ fontSize: 12, color: '#0071e3', display: 'block' }}>{t.listing_tip}</Text>
                              </Card>
                            ))}
                          </Space>
                        </Col>
                        <Col span={12}>
                          <Title level={5} style={{ color: '#ff4d4f' }}>负面评论主题</Title>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            {(analysisData.voc_insights?.negative_themes || []).map((t: any, i: number) => (
                              <Card key={i} size="small" style={{ borderLeft: '3px solid #ff4d4f' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Text strong>{t.name}</Text>
                                  <Text type="secondary">{t.percentage}</Text>
                                </div>
                                <Text style={{ fontSize: 12, color: '#ff4d4f', display: 'block' }}>{t.solution}</Text>
                              </Card>
                            ))}
                          </Space>
                        </Col>
                      </Row>
                    </Card>
                  )
                },
                {
                  key: 'market', label: '市场分析',
                  children: (
                    <Card style={{ borderRadius: 12 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={16}>
                        {analysisData.market?.competition && (
                          <div>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>竞争格局</Text>
                            <Paragraph>{analysisData.market.competition}</Paragraph>
                          </div>
                        )}
                        {analysisData.market?.price_range && (
                          <div>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>价格区间</Text>
                            <Paragraph>{analysisData.market.price_range}</Paragraph>
                          </div>
                        )}
                        {analysisData.market?.positioning && (
                          <div>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>定位建议</Text>
                            <Paragraph>{analysisData.market.positioning}</Paragraph>
                          </div>
                        )}
                        {analysisData.market?.supply_chain && (
                          <div>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>1688采购参考</Text>
                            <Paragraph>{analysisData.market.supply_chain}</Paragraph>
                          </div>
                        )}
                        {analysisData.market?.keywords && (
                          <div>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>流量关键词</Text>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {analysisData.market.keywords.map((k: string, i: number) => <Tag key={i}>{k}</Tag>)}
                            </div>
                          </div>
                        )}
                      </Space>
                    </Card>
                  )
                },
              ]} />
            )}

            {analysisData && (
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <Button type="primary" size="large" onClick={() => setCurrentStep(2)}>下一步：生成文案 →</Button>
                <Button onClick={() => setCurrentStep(0)}>← 返回修改</Button>
              </div>
            )}
            {!analysisData && !analyzing && (
              <Button onClick={() => setCurrentStep(0)} style={{ marginTop: 16 }}>← 返回修改</Button>
            )}
          </div>
        )}

        {/* ─── 第3步：文案生成 ─── */}
        {currentStep === 2 && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <Title level={4} style={{ margin: 0 }}>3. 文案生成</Title>
                <Text type="secondary">三源融合：COSMO + VOC + 关键词数据</Text>
              </div>
              <Space>
                <Select value={input.ai_model} onChange={v => setInput(p => ({ ...p, ai_model: v }))} style={{ width: 220 }} options={AI_MODELS} />
                <Button type="primary" size="large" icon={generating ? <LoadingOutlined /> : <RocketOutlined />} loading={generating} onClick={generateCopy}>
                  {generating ? statusMsg || '生成中...' : '生成文案'}
                </Button>
              </Space>
            </div>

            {editingListing && (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Card title={<Space><Tag color="blue">Title</Tag><Text>标题</Text></Space>} style={{ borderRadius: 12 }}>
                  {(editingListing.title_a || editingListing.title_b) && (
                    <div style={{ marginBottom: 16 }}>
                      {editingListing.title_a && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Tag color="blue">A版·核心词前置</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>{editingListing.title_a.length}字符</Text>
                            <Button size="small" onClick={() => setEditingListing(p => p ? { ...p, title: p.title_a || '' } : p)}>使用A版</Button>
                          </div>
                          <div style={{ padding: '8px 12px', background: '#e6f4ff', borderRadius: 6, fontSize: 13 }}>{editingListing.title_a}</div>
                        </div>
                      )}
                      {editingListing.title_b && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Tag color="purple">B版·场景驱动</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>{editingListing.title_b.length}字符</Text>
                            <Button size="small" onClick={() => setEditingListing(p => p ? { ...p, title: p.title_b || '' } : p)}>使用B版</Button>
                          </div>
                          <div style={{ padding: '8px 12px', background: '#f9f0ff', borderRadius: 6, fontSize: 13 }}>{editingListing.title_b}</div>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>当前选用（{editingListing.title?.length || 0}字符）</Text>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setIsEditing(!isEditing)}>{isEditing ? '完成' : '编辑'}</Button>
                  </div>
                  {isEditing
                    ? <Input value={editingListing.title} onChange={e => setEditingListing(p => p ? { ...p, title: e.target.value } : p)} />
                    : <Text copyable>{editingListing.title}</Text>
                  }
                </Card>

                <Card title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space><Tag color="green">Bullets</Tag><Text>五点描述</Text></Space>
                    <Text copyable={{ text: (editingListing.bullets || []).join('\n\n') }} style={{ fontSize: 12, color: '#999' }}>复制全部五点</Text>
                  </div>
                } style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {(editingListing.bullets || []).map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <Tag color="green" style={{ flexShrink: 0, marginTop: 2 }}>{i+1}</Tag>
                        {isEditing
                          ? <TextArea value={b} autoSize onChange={e => setEditingListing(p => p ? { ...p, bullets: p.bullets.map((x, j) => j === i ? e.target.value : x) } : p)} />
                          : <Text copyable style={{ flex: 1 }}>{b}</Text>
                        }
                      </div>
                    ))}
                  </Space>
                </Card>

                <Card title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space><Tag color="purple">Description</Tag><Text>产品描述（{editingListing.description?.length || 0}字符）</Text></Space>
                    <Text copyable={{ text: descToPlainText(editingListing.description) }} style={{ fontSize: 12, color: '#999' }}>复制全部描述</Text>
                  </div>
                } style={{ borderRadius: 12 }}>
                  {isEditing
                    ? <TextArea value={editingListing.description} autoSize={{ minRows: 4 }} onChange={e => setEditingListing(p => p ? { ...p, description: e.target.value } : p)} />
                    : <div>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          {descToSections(editingListing.description).map((sec, i) => {
                            const lines = sec.split('\n')
                            return (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <Tag color="purple" style={{ flexShrink: 0, marginTop: 2 }}>{i + 1}</Tag>
                                <Text copyable={{ text: sec }} style={{ flex: 1, whiteSpace: 'pre-wrap' }}>
                                  {lines.length > 1 ? <><strong>{lines[0]}</strong>{'\n' + lines.slice(1).join('\n')}</> : sec}
                                </Text>
                              </div>
                            )
                          })}
                        </Space>
                        <Text copyable={{ text: editingListing.description }} style={{ fontSize: 12, color: '#999' }}>复制原始HTML</Text>
                      </div>
                  }
                </Card>

                <Card title={<Space><Tag color="orange">Search Terms</Tag></Space>} style={{ borderRadius: 12 }}>
                  {isEditing
                    ? <Input value={editingListing.search_terms} onChange={e => setEditingListing(p => p ? { ...p, search_terms: e.target.value } : p)} />
                    : <Text copyable>{editingListing.search_terms}</Text>
                  }
                </Card>

                {/* 质检表 */}
                {editingListing.qa_checklist && Object.keys(editingListing.qa_checklist).length > 0 && (
                  <Card title={<Space><Tag color="gold">质检表</Tag><Text>6项合规检查</Text></Space>} style={{ borderRadius: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(editingListing.qa_checklist).map(([key, val]) => {
                        const labels: Record<string, string> = {
                          title_70chars: '前70字符截断',
                          keyword_coverage: '关键词覆盖',
                          voc_mapping: 'VOC对应',
                          compliance_check: '合规检查',
                          rufus_friendly: 'Rufus友好度',
                          st_dedup: 'ST去重',
                        }
                        const isPass = String(val).toLowerCase().includes('pass') || String(val).toLowerCase().includes('yes')
                        const isFail = String(val).toLowerCase().includes('fail') || String(val).toLowerCase().includes('no')
                        return (
                          <div key={key} style={{ padding: '8px 10px', background: isPass ? '#f6ffed' : isFail ? '#fff2f0' : '#fafafa', borderRadius: 6, borderLeft: `3px solid ${isPass ? '#52c41a' : isFail ? '#ff4d4f' : '#d9d9d9'}` }}>
                            <Text strong style={{ fontSize: 12, display: 'block' }}>{labels[key] || key}</Text>
                            <Text style={{ fontSize: 12, color: '#555' }}>{String(val)}</Text>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}

                {/* 关键词覆盖率 */}
                {editingListing.keyword_coverage_table && editingListing.keyword_coverage_table.length > 0 && (
                  <Card title={<Space><Tag color="cyan">关键词覆盖率</Tag></Space>} style={{ borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                          {['关键词', '量级', 'Title', 'BP', 'Desc', 'ST'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #e8e8e8' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {editingListing.keyword_coverage_table.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '5px 10px', border: '1px solid #e8e8e8', fontWeight: 500 }}>{row.keyword}</td>
                            <td style={{ padding: '5px 10px', border: '1px solid #e8e8e8' }}>
                              <Tag color={row.volume === '高' ? 'red' : row.volume === '中' ? 'orange' : 'default'} style={{ fontSize: 11 }}>{row.volume}</Tag>
                            </td>
                            {(['title', 'bullets', 'description', 'st'] as const).map(field => (
                              <td key={field} style={{ padding: '5px 10px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                                {row[field] ? <span style={{ color: '#52c41a' }}>✓</span> : <span style={{ color: '#d9d9d9' }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}

                {editingListing.next_steps && editingListing.next_steps.length > 0 && (
                  <Card title={<Space><Tag color="lime">下一步建议</Tag></Space>} style={{ borderRadius: 12 }}>
                    {editingListing.next_steps.map((step, i) => (
                      <div key={i} style={{ padding: '4px 0', fontSize: 13, color: '#555' }}>
                        <span style={{ color: '#0071e3', marginRight: 8 }}>{i + 1}.</span>{step}
                      </div>
                    ))}
                  </Card>
                )}

                <Button type="primary" size="large" onClick={generateImageStrategy}>下一步：图片策略 →</Button>
              </Space>
            )}

            {!editingListing && (
              <Button onClick={() => setCurrentStep(1)} style={{ marginTop: 16 }}>← 返回数据分析</Button>
            )}
          </div>
        )}

        {/* ─── 第4步：图片策略 ─── */}
        {currentStep === 3 && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <Title level={4} style={{ margin: 0 }}>4. 图片策略</Title>
                <Text type="secondary">AI基于数据规划图片内容</Text>
              </div>
              <Button type="primary" icon={generating ? <LoadingOutlined /> : <RocketOutlined />} loading={generating} onClick={generateImageStrategy}>
                {generating ? '生成中...' : '生成策略'}
              </Button>
            </div>

            {imageStrategy.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {imageStrategy.map((img, i) => (
                  <Card key={i} style={{ borderRadius: 12, borderLeft: '4px solid #0071e3' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <Tag color="blue" style={{ flexShrink: 0, fontSize: 13, padding: '4px 10px' }}>图{i+1}</Tag>
                      <Text style={{ fontSize: 14 }}>{img}</Text>
                    </div>
                  </Card>
                ))}
                <Button type="primary" size="large" onClick={() => setCurrentStep(4)}>下一步：导出 →</Button>
              </Space>
            ) : (
              <Alert message="点击「生成策略」按钮生成图片拍摄建议" type="info" showIcon />
            )}
          </div>
        )}

        {/* ─── 第5步：导出 ─── */}
        {currentStep === 4 && (
          <div style={{ maxWidth: 600 }}>
            <Title level={4}>5. 导出</Title>
            {editingListing ? (
              <Card style={{ borderRadius: 12 }}>
                <Row gutter={16} style={{ marginBottom: 20 }}>
                  {[
                    { label: '文案段落', value: 4, color: '#0071e3' },
                    { label: '图片策略', value: imageStrategy.length, color: '#52c41a' },
                    { label: '字符数', value: (editingListing.title?.length || 0) + (editingListing.description?.length || 0), color: '#fa8c16' },
                  ].map(s => (
                    <Col span={8} key={s.label}>
                      <Card style={{ textAlign: 'center', borderRadius: 8 }}>
                        <Statistic title={s.label} value={s.value} valueStyle={{ color: s.color, fontSize: 24 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Button type="primary" icon={<FileTextOutlined />} size="large" onClick={copyAll} block>
                    复制全部文案
                  </Button>
                  <Button icon={<DownloadOutlined />} size="large" onClick={exportTXT} block>
                    导出文案（TXT）
                  </Button>
                  <Button icon={<DownloadOutlined />} size="large" onClick={() => {
                    if (!editingListing) return
                    const rows = [
                      ['字段', '内容'],
                      ['Title A版', editingListing.title_a || ''],
                      ['Title B版', editingListing.title_b || ''],
                      ['Title 当前选用', editingListing.title || ''],
                      ...((editingListing.bullets || []).map((b, i) => [`Bullet ${i+1}`, b])),
                      ['Description（纯文本）', (editingListing.description || '').replace(/<[^>]*>/g, '').replace(/\n\n+/g, ' ').trim()],
                      ['Search Terms', editingListing.search_terms || ''],
                    ]
                    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `Listing_${input.product_name || 'export'}_${new Date().toISOString().slice(0,10)}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }} block>
                    导出文案（Excel/CSV）
                  </Button>
                  <Button icon={<RocketOutlined />} size="large" onClick={() => setCurrentStep(2)} block>
                    ← 返回编辑文案
                  </Button>
                </Space>
              </Card>
            ) : (
              <Alert message="请先完成文案生成" type="warning" showIcon />
            )}
          </div>
        )}

      </div>
    </div>
  )
}
