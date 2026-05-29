import {
  FileTextOutlined,
  LoadingOutlined,
  RocketOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'

const { Title, Text, Paragraph } = Typography

interface VOCInput {
  asin: string
  competitor_asins: string
  site: string
  data_source: 'sorftime' | 'upload'
  analysis_mode: 'single' | 'category'
  ai_model: string
}

interface VOCReport {
  overview?: any
  personas?: any[]
  use_scenes?: any[]
  purchase_motivations?: any[]
  positive_tops?: any[]
  negative_tops?: any[]
  unmet_needs?: any[]
  keywords?: any[]
  kano?: any
  improvement_roadmap?: any[]
  listing_application?: any
  raw?: string
}

const STEPS = ['1. 输入', '2. 评论采集&分析', '3. VOC报告', '4. 导出']

const AI_MODELS = [
  { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
  { value: 'gemini', label: 'Gemini 2.5 Flash（快速）' },
  { value: 'gemini-pro', label: 'Gemini 2.5 Pro（深度·较慢）' },
  { value: 'claude', label: 'Claude Sonnet 4.6（深度分析）' },
  { value: 'gpt4o', label: 'GPT-4o（待充值）' },
]

export default function VOCAnalysis() {
  const { message } = AntApp.useApp()
  const [currentStep, setCurrentStep] = usePersistedState('voc:step', 0)
  const [analyzing, setAnalyzing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [report, setReport] = usePersistedState<VOCReport | null>('voc:report', null)
  const [activeTab, setActiveTab] = useState('overview')
  const [input, setInput] = usePersistedState<VOCInput>('voc:input', {
    asin: '',
    competitor_asins: '',
    site: 'US',
    data_source: 'sorftime',
    analysis_mode: 'single',
    ai_model: 'gemini',
  })

  async function startAnalysis() {
    if (!input.asin.trim()) { message.error('请输入至少一个ASIN'); return }
    setAnalyzing(true)
    setStatusMsg('正在采集评论数据...')
    try {
      const res = await fetch('/api/voc/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          asin: input.asin.trim(),
          competitor_asins: input.competitor_asins.split(',').map((s: string) => s.trim()).filter(Boolean),
          site: input.site,
          data_source: input.data_source,
          analysis_mode: input.analysis_mode,
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
            setReport(p.report)
            setCurrentStep(2)
            setActiveTab('overview')
          } else if (p.type === 'error') {
            message.error(p.content)
            setCurrentStep(0)
          }
        }
      }
    } catch {
      message.error('分析失败，请重试')
      setCurrentStep(0)
    } finally {
      setAnalyzing(false)
      setStatusMsg('')
    }
  }

  function exportTXT() {
    if (!report) return
    const lines = [
      `VOC分析报告 - ${input.asin}`,
      `生成时间: ${new Date().toLocaleString()}`,
      '='.repeat(60),
      '',
      '【评论概览】',
      `总评论数: ${report.overview?.total_reviews || '-'}`,
      `平均评分: ${report.overview?.avg_rating || '-'}★`,
      `好评率: ${report.overview?.positive_rate || '-'}`,
      '',
      '【好评TOP】',
      ...(report.positive_tops || []).map((t, i) => `${i+1}. ${t.name}（${t.count}）\n   ${t.listing_tip}`),
      '',
      '【差评TOP】',
      ...(report.negative_tops || []).map((t, i) => `${i+1}. ${t.name}（${t.count}）\n   ${t.listing_tip}`),
      '',
      '【未满足需求】',
      ...(report.unmet_needs || []).map((t, i) => `${i+1}. ${t.name}（${t.count}）\n   ${t.opportunity}`),
      '',
      '【改进路线】',
      ...(report.improvement_roadmap || []).map((t, i) => `${i+1}. [${t.priority}] ${t.name}\n   ${t.action}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `VOC报告_${input.asin}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  }

  function goTo(i: number) {
    if (i === 0) { setCurrentStep(0); return }
    if (i === 1 && input.asin.trim()) { setCurrentStep(1); return }
    if ((i === 2 || i === 3) && report) { setCurrentStep(i); return }
  }

  // ─── 报告各Tab内容 ────────────────────────────────────────────────────────

  function renderOverview() {
    const ov = report?.overview || {}
    const dist = ov.rating_distribution || {}
    return (
      <div>
        <Alert message={ov.confidence || '高置信度分析'} type="success" showIcon style={{ marginBottom: 20 }} />
        <Row gutter={16} style={{ marginBottom: 24 }}>
          {[
            { label: '总评论', value: ov.total_reviews || '-', color: '#0071e3' },
            { label: '平均评分', value: ov.avg_rating ? `${ov.avg_rating}★` : '-', color: '#fa8c16' },
            { label: '好评率（估算）', value: ov.positive_rate || '-', color: '#52c41a' },
            { label: '差评率（估算）', value: ov.negative_rate || '-', color: '#ff4d4f' },
          ].map(s => (
            <Col span={6} key={s.label}>
              <Card style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title={s.label} value={s.value} valueStyle={{ color: s.color, fontSize: 22 }} />
              </Card>
            </Col>
          ))}
        </Row>
        <Card title="评分分布（估算·基于平均分）" style={{ borderRadius: 12 }}>
          {[5,4,3,2,1].map(star => {
            const pct = parseFloat((dist[`${star}star`] || '0').toString().replace('%','')) || 0
            return (
              <Row key={star} align="middle" style={{ marginBottom: 8 }} gutter={12}>
                <Col span={2}><Text>{star}星</Text></Col>
                <Col span={18}><Progress percent={pct} showInfo={false} strokeColor={star >= 4 ? '#faad14' : '#ff4d4f'} /></Col>
                <Col span={4}><Text type="secondary">{dist[`${star}star`] || '-'}</Text></Col>
              </Row>
            )
          })}
        </Card>
      </div>
    )
  }

  function renderPersonas() {
    const personas = report?.personas || []
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {personas.map((p, i) => (
          <Card key={i} style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Title level={5} style={{ margin: 0 }}>{p.name}</Title>
              <Tag color="blue">{p.type}</Tag>
              <Text type="secondary">{p.count}</Text>
            </div>
            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" title="WHO · 谁" style={{ background: '#f0f7ff', border: 'none', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12 }}>年龄：{p.who?.age}</Text><br />
                  <Text style={{ fontSize: 12 }}>性别：{p.who?.gender}</Text><br />
                  <Text style={{ fontSize: 12 }}>职业：{p.who?.occupation}</Text>
                </Card>
                <Card size="small" title="HOW · 怎么用" style={{ background: '#f6ffed', border: 'none' }}>
                  <Text style={{ fontSize: 12 }}>使用频率：{p.how?.frequency}</Text><br />
                  <Text style={{ fontSize: 12 }}>使用习惯：{p.how?.habit}</Text><br />
                  <Text style={{ fontSize: 12 }}>购买触发：{p.how?.trigger}</Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="WHAT · 要什么" style={{ background: '#fff7e6', border: 'none', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12 }}>核心需求：{p.what?.core_need}</Text><br />
                  <Text style={{ fontSize: 12 }}>最大痛点：{p.what?.pain_point}</Text>
                </Card>
                <Card size="small" title="WHERE · 在哪" style={{ background: '#f9f0ff', border: 'none' }}>
                  <Text style={{ fontSize: 12 }}>主要场景：{p.where?.scene}</Text><br />
                  <Text style={{ fontSize: 12 }}>环境细节：{p.where?.context}</Text>
                </Card>
              </Col>
            </Row>
            <div style={{ marginTop: 12 }}>
              {(p.quotes || []).map((q: string, qi: number) => (
                <Text key={qi} type="secondary" style={{ fontSize: 12, display: 'block', fontStyle: 'italic' }}>"{q}"</Text>
              ))}
            </div>
          </Card>
        ))}
      </Space>
    )
  }

  function renderTopicList(items: any[], type: 'positive' | 'negative' | 'scene' | 'motivation' | 'unmet') {
    const borderColor = type === 'positive' ? '#52c41a' : type === 'negative' ? '#ff4d4f' : '#0071e3'
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {(items || []).map((item, i) => (
          <Card key={i} style={{ borderRadius: 12, borderLeft: `4px solid ${borderColor}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Title level={5} style={{ margin: 0 }}>{item.name}</Title>
              <Text type="secondary">{item.count}</Text>
            </div>
            {item.listing_tip && (
              <Text style={{ fontSize: 13, color: '#0071e3', display: 'block', marginBottom: 8 }}>
                Listing应用：{item.listing_tip}
              </Text>
            )}
            {item.opportunity && (
              <Text style={{ fontSize: 13, color: '#722ed1', display: 'block', marginBottom: 8 }}>
                差异化机会：{item.opportunity}
              </Text>
            )}
            {(item.quotes || []).map((q: string, qi: number) => (
              <Text key={qi} type="secondary" style={{ fontSize: 12, display: 'block', fontStyle: 'italic' }}>"{q}"</Text>
            ))}
          </Card>
        ))}
      </Space>
    )
  }

  function renderKeywords() {
    const kws = report?.keywords || []
    return (
      <Card title="高频关键词" style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {kws.map((kw: any, i: number) => (
            <Tag
              key={i}
              color={kw.sentiment === 'positive' ? 'green' : kw.sentiment === 'negative' ? 'red' : 'default'}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              {kw.word} ({kw.count})
            </Tag>
          ))}
        </div>
      </Card>
    )
  }

  function renderKANO() {
    const kano = report?.kano || {}
    const sections = [
      { key: 'must_have', label: '必备需求', color: '#ff4d4f', bg: '#fff1f0' },
      { key: 'performance', label: '期望需求', color: '#0071e3', bg: '#e6f4ff' },
      { key: 'delighter', label: '兴奋需求', color: '#52c41a', bg: '#f6ffed' },
      { key: 'indifferent', label: '无关需求', color: '#999', bg: '#fafafa' },
    ]
    return (
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          KANO需求分类 · 每项标注 <Tag color="blue" style={{ fontSize: 11 }}>基础</Tag> / <Tag color="orange" style={{ fontSize: 11 }}>期望</Tag> 需求层次 + 马斯洛层次
        </Text>
        <Row gutter={16}>
          {sections.map(s => (
            <Col span={12} key={s.key} style={{ marginBottom: 16 }}>
              <Card
                title={<Text style={{ color: s.color }}>{s.label}（{(kano[s.key] || []).length}）</Text>}
                style={{ borderRadius: 12, background: s.bg, border: `1px solid ${s.color}22` }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {(kano[s.key] || []).map((item: any, i: number) => (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                        {(item.tags || []).map((tag: string, ti: number) => (
                          <Tag key={ti} color={tag === '基础' ? 'blue' : 'orange'} style={{ fontSize: 11 }}>{tag}</Tag>
                        ))}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>— {item.description}</Text>
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    )
  }

  function renderRoadmap() {
    const items = report?.improvement_roadmap || []
    const priorityColor: Record<string, string> = { '高': '#ff4d4f', '中': '#fa8c16', '低': '#52c41a' }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {items.map((item, i) => (
          <Card key={i} style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color={priorityColor[item.priority] || 'default'} style={{ fontWeight: 600 }}>{item.priority}</Tag>
              <Title level={5} style={{ margin: 0 }}>{item.name}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.negative_rate}</Text>
            </div>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{item.action}</Text>
            <Text style={{ fontSize: 12, color: '#0071e3' }}>预期效果：{item.expected_result}</Text>
          </Card>
        ))}
      </Space>
    )
  }

  function renderListingApplication() {
    const la = report?.listing_application || {}
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card title={<><Tag color="blue">Title</Tag> {la.title_insight}</>} style={{ borderRadius: 12 }}>
          <Text style={{ fontSize: 14 }}>{la.title_example}</Text>
        </Card>
        <Card title={<><Tag color="green">Bullets</Tag> {la.bullets_insight}</>} style={{ borderRadius: 12 }}>
          {(la.bullets_example || []).map((b: string, i: number) => (
            <Text key={i} style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>【{i+1}】{b}</Text>
          ))}
        </Card>
        <Card title={<><Tag color="purple">Description</Tag> {la.description_insight}</>} style={{ borderRadius: 12 }}>
          <Text style={{ fontSize: 13 }}>{la.description_example}</Text>
        </Card>
        <Card title={<><Tag color="orange">Images</Tag> {la.images_insight}</>} style={{ borderRadius: 12 }}>
          {(la.images_example || []).map((img: string, i: number) => (
            <Text key={i} style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{i+1}. {img}</Text>
          ))}
        </Card>
        <Card style={{ borderRadius: 12, background: '#f0f7ff', border: '1px solid #0071e333' }}>
          <Text style={{ color: '#0071e3', fontSize: 13 }}>
            🔗 应用到其他模块：此VOC报告可在文案优化/视觉优化/采购需求书中作为数据输入。
          </Text>
        </Card>
      </Space>
    )
  }

  const tabItems = [
    { key: 'overview', label: '评论概览', children: renderOverview() },
    { key: 'personas', label: `人群画像(${report?.personas?.length || 0})`, children: renderPersonas() },
    { key: 'scenes', label: `使用场景(${report?.use_scenes?.length || 0})`, children: renderTopicList(report?.use_scenes || [], 'scene') },
    { key: 'motivations', label: `购买动机(${report?.purchase_motivations?.length || 0})`, children: renderTopicList(report?.purchase_motivations || [], 'motivation') },
    { key: 'positive', label: `好评TOP(${report?.positive_tops?.length || 0})`, children: renderTopicList(report?.positive_tops || [], 'positive') },
    { key: 'negative', label: `差评TOP(${report?.negative_tops?.length || 0})`, children: renderTopicList(report?.negative_tops || [], 'negative') },
    { key: 'unmet', label: `未满足(${report?.unmet_needs?.length || 0})`, children: renderTopicList(report?.unmet_needs || [], 'unmet') },
    { key: 'keywords', label: '关键词云', children: renderKeywords() },
    { key: 'kano', label: `KANO(${(report?.kano ? Object.values(report.kano).flat().length : 0)})`, children: renderKANO() },
    { key: 'roadmap', label: '改进路线', children: renderRoadmap() },
    { key: 'listing', label: 'Listing应用', children: renderListingApplication() },
  ]

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)', background: '#f5f5f7' }}>

      {/* 左侧导航 */}
      <div style={{ width: 200, background: '#fff', borderRight: '1px solid #e8e8e8', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13, color: '#0071e3' }}>□ VOC深度分析</Text>
        </div>
        {STEPS.map((label, i) => (
          <div
            key={i}
            onClick={() => goTo(i)}
            style={{
              padding: '10px 20px', cursor: 'pointer',
              background: currentStep === i ? '#e6f4ff' : 'transparent',
              borderLeft: currentStep === i ? '3px solid #0071e3' : '3px solid transparent',
              color: currentStep === i ? '#0071e3' : i <= currentStep ? '#333' : '#bbb',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
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

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 24 }}>
          <Title level={4} style={{ margin: 0 }}>VOC Analysis</Title>
          <div style={{ display: 'flex', gap: 20 }}>
            {['1. 输入', '2. 分析', '3. 报告', '4. 导出'].map((label, i) => (
              <Text key={i} onClick={() => goTo(i)} style={{
                fontSize: 13, cursor: 'pointer',
                color: currentStep === i ? '#0071e3' : '#bbb',
                fontWeight: currentStep === i ? 600 : 400,
              }}>{label}</Text>
            ))}
          </div>
        </div>

        {/* 第1步 */}
        {currentStep === 0 && (
          <div style={{ maxWidth: 760 }}>
            <Title level={4}>1. 分析设置</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>选择数据来源和分析模式</Text>

            <Text strong style={{ display: 'block', marginBottom: 12 }}>数据来源</Text>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              {[
                { key: 'sorftime', icon: '🗄', title: 'Sorftime自动采集', desc: '输入ASIN，自动拉取好评100条+差评100条', tag: '⚡ 好评差评分开采集，数据量充足', tagColor: '#fa8c16' },
                { key: 'upload', icon: '⬆', title: '上传评论文件', desc: '上传CSV/Excel/TXT评论数据（100+条）', tag: '✅ 数据量大，分析可靠，推荐', tagColor: '#52c41a' },
              ].map(opt => (
                <Col span={12} key={opt.key}>
                  <div onClick={() => setInput(p => ({ ...p, data_source: opt.key as any }))} style={{
                    border: `2px solid ${input.data_source === opt.key ? '#0071e3' : '#e8e8e8'}`,
                    borderRadius: 10, padding: 16, cursor: 'pointer',
                    background: input.data_source === opt.key ? '#f0f7ff' : '#fff',
                  }}>
                    <Text strong>{opt.icon} {opt.title}</Text>
                    <Paragraph style={{ fontSize: 12, color: '#666', margin: '6px 0 4px' }}>{opt.desc}</Paragraph>
                    <Text style={{ fontSize: 11, color: opt.tagColor }}>{opt.tag}</Text>
                  </div>
                </Col>
              ))}
            </Row>

            <Text strong style={{ display: 'block', marginBottom: 12 }}>分析模式</Text>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              {[
                { key: 'single', title: '单品VOC', desc: '深度分析一个产品的全部评论' },
                { key: 'category', title: '品类VOC', desc: '多个产品评论聚合，找品类共性' },
              ].map(opt => (
                <Col span={12} key={opt.key}>
                  <div onClick={() => setInput(p => ({ ...p, analysis_mode: opt.key as any }))} style={{
                    border: `2px solid ${input.analysis_mode === opt.key ? '#0071e3' : '#e8e8e8'}`,
                    borderRadius: 10, padding: 16, cursor: 'pointer',
                    background: input.analysis_mode === opt.key ? '#f0f7ff' : '#fff',
                  }}>
                    <Text strong>{opt.title}</Text>
                    <Paragraph style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{opt.desc}</Paragraph>
                  </div>
                </Col>
              ))}
            </Row>

            <Text strong style={{ display: 'block', marginBottom: 8 }}>产品ASIN *</Text>
            <Input placeholder="B0XXXXXXXXXX" value={input.asin} onChange={e => setInput(p => ({ ...p, asin: e.target.value }))} style={{ fontFamily: 'monospace', marginBottom: 16 }} />

            <Text strong style={{ display: 'block', marginBottom: 4 }}>对比竞品 ASIN（可选，1-3个）</Text>
            <Input placeholder="B0AAAA, B0BBBB（英文逗号分隔）" value={input.competitor_asins} onChange={e => setInput(p => ({ ...p, competitor_asins: e.target.value }))} style={{ fontFamily: 'monospace', marginBottom: 4 }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              💡 填写竞品ASIN后，差评TOP会显示"我司占比 vs 竞品平均占比"
            </Text>

            <Text strong style={{ display: 'block', marginBottom: 8 }}>目标市场</Text>
            <Select value={input.site} onChange={v => setInput(p => ({ ...p, site: v }))} style={{ width: 200, marginBottom: 24 }}
              options={[
                { value: 'US', label: '🇺🇸 美国 (US)' },
                { value: 'UK', label: '🇬🇧 英国 (UK)' },
                { value: 'DE', label: '🇩🇪 德国 (DE)' },
                { value: 'JP', label: '🇯🇵 日本 (JP)' },
              ]}
            />

            {!input.asin.trim() && <Alert message="请输入至少一个ASIN" type="warning" showIcon style={{ marginBottom: 16 }} />}
            <Button type="primary" size="large" disabled={!input.asin.trim()} onClick={() => setCurrentStep(1)}>下一步 →</Button>
          </div>
        )}

        {/* 第2步 */}
        {currentStep === 1 && (
          <div style={{ maxWidth: 760 }}>
            <Title level={4}>2. 评论采集 & AI分析</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>从Sorftime采集好评+差评，AI生成12板块VOC报告</Text>

            <Card style={{ borderRadius: 12, marginBottom: 20 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>采集计划</Text>
              <Text style={{ color: '#52c41a', fontSize: 13 }}>● {input.asin} — 产品详情 + 好评 + 差评 + 综合评论</Text><br/>
              <Text style={{ color: '#fa8c16', fontSize: 13 }}>⚡ Sorftime模式：每个ASIN好评100条+差评100条</Text>
            </Card>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Select value={input.ai_model} onChange={v => setInput(p => ({ ...p, ai_model: v }))} style={{ width: 260 }} options={AI_MODELS} />
              <Button type="primary" size="large" icon={analyzing ? <LoadingOutlined /> : <RocketOutlined />} loading={analyzing} onClick={startAnalysis}>
                {analyzing ? statusMsg || '分析中...' : '开始分析'}
              </Button>
            </div>
            <Button onClick={() => setCurrentStep(0)}>← 返回修改</Button>
          </div>
        )}

        {/* 第3步 */}
        {currentStep === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>3. VOC报告</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>12板块消费者洞察</Text>
            </div>
            {report ? (
              <>
                <Alert
                  message={report.overview?.confidence || `高置信度 — 本次分析基于真实评论数据`}
                  type="success" showIcon style={{ marginBottom: 16 }}
                />
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  items={tabItems}
                  style={{ background: '#fff', borderRadius: 12, padding: '0 16px' }}
                />
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                  <Button type="primary" onClick={() => setCurrentStep(3)}>下一步：导出 →</Button>
                  <Button onClick={() => setCurrentStep(1)}>重新分析</Button>
                </div>
              </>
            ) : (
              <Alert message="请先完成分析" type="warning" showIcon />
            )}
          </div>
        )}

        {/* 第4步 */}
        {currentStep === 3 && (
          <div style={{ maxWidth: 600 }}>
            <Title level={4}>4. 导出</Title>
            {report ? (
              <Card style={{ borderRadius: 12 }}>
                <Row gutter={16} style={{ marginBottom: 20 }}>
                  {[
                    { label: '好评主题', value: report.positive_tops?.length || 0, color: '#52c41a' },
                    { label: '差评痛点', value: report.negative_tops?.length || 0, color: '#ff4d4f' },
                    { label: '未满足需求', value: report.unmet_needs?.length || 0, color: '#722ed1' },
                  ].map(s => (
                    <Col span={8} key={s.label}>
                      <Card style={{ textAlign: 'center', borderRadius: 8 }}>
                        <Statistic title={s.label} value={s.value} valueStyle={{ color: s.color, fontSize: 28 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Button type="primary" icon={<DownloadOutlined />} size="large" onClick={exportTXT} block>
                    VOC报告（TXT）概览 + 好评/差评主题 + 未满足需求 + 改进路线图
                  </Button>
                  <Button icon={<RocketOutlined />} size="large" onClick={() => window.location.href = '/listing'} block>
                    🚀 → 用于 Listing 文案
                  </Button>
                  <Button onClick={() => setCurrentStep(2)} block>← 返回报告</Button>
                </Space>
              </Card>
            ) : (
              <Alert message="请先完成分析" type="warning" showIcon />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
