import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const AI_MODELS = [
  { value: 'deepseek', label: 'DeepSeek V4（推荐·省成本）' },
  { value: 'gemini', label: 'Gemini 2.5 Flash（快速）' },
  { value: 'claude', label: 'Claude Sonnet 4.6（深度分析）' },
  { value: 'gpt4o', label: 'GPT-4o（待充值）' },
]

const STEPS = ['1. 产品输入', '2. 文案诊断', '3. 优化方案', '4. 导出']

export default function ListingOptimizer() {
  const { message } = AntApp.useApp()
  const { token } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [diagnosis, setDiagnosis] = useState<any>(null)
  const [optimized, setOptimized] = useState<any>(null)
  const [form] = Form.useForm()
  const [aiModel, setAiModel] = useState('deepseek')

  async function runStream(values: any, mode: string) {
    setLoading(true)
    setStatusMsg('')
    try {
      const res = await fetch('/api/listing-optimizer/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // competitor_asins字符串转数组
        const competitorAsins = values.competitor_asins
          ? values.competitor_asins.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []
        body: JSON.stringify({ ...values, competitor_asins: competitorAsins, ai_model: aiModel, mode }),
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
          if (p.type === 'status') setStatusMsg(p.content)
          if (p.type === 'diagnosis') { setDiagnosis(p.data); setCurrentStep(1) }
          if (p.type === 'optimized') { setOptimized(p.data); setCurrentStep(2) }
          if (p.type === 'error') { message.error(p.content); setLoading(false) }
        }
      }
    } catch (e) {
      message.error('请求失败，请重试')
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  function scoreColor(score: number, max: number) {
    const pct = score / max
    if (pct >= 0.8) return '#52c41a'
    if (pct >= 0.5) return '#faad14'
    return '#ff4d4f'
  }

  function renderStep0() {
    return (
      <Card title="1. 产品输入" style={{ maxWidth: 720, margin: '0 auto' }}>
        <Form form={form} layout="vertical" onFinish={(v) => runStream(v, 'both')}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="asin" label="自家产品 ASIN（可选）">
                <Input placeholder="B0XXXXXXXXXX，系统自动抓取现有文案" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="site" label="目标市场" initialValue="US">
                <Select options={[
                  { value: 'US', label: '🇺🇸 美国 (US)' },
                  { value: 'UK', label: '🇬🇧 英国 (UK)' },
                  { value: 'DE', label: '🇩🇪 德国 (DE)' },
                  { value: 'JP', label: '🇯🇵 日本 (JP)' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="competitor_asins" label="竞品 ASIN（最多3个，逗号分隔）">
            <Input placeholder="B0AAAA, B0BBBB, B0CCCC" />
          </Form.Item>
          <Form.Item label="现有标题（若填了ASIN可留空自动获取）" name="existing_title">
            <Input placeholder="粘贴现有英文标题" />
          </Form.Item>
          <Form.Item label="现有五点描述" name="existing_bullets">
            <TextArea rows={6} placeholder={'每行一条，例如：\nDURABLE MATERIAL: Made from...\nPERFECT FIT: Compatible with...'} />
          </Form.Item>
          <Form.Item label="AI 模型">
            <Select value={aiModel} onChange={setAiModel} options={AI_MODELS} style={{ width: 220 }} />
          </Form.Item>
          {statusMsg && <Alert message={statusMsg} type="info" showIcon style={{ marginBottom: 12 }} />}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              开始诊断 + 优化
            </Button>
          </Form.Item>
        </Form>
      </Card>
    )
  }

  function renderStep1() {
    if (!diagnosis) return <Alert message="请先完成第1步" type="warning" showIcon />
    const { ai_score, keyword_gaps, voc_anchors, compliance } = diagnosis
    const total = ai_score?.total ?? 0

    return (
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI评分 */}
        <Card title="AI 可读性评分">
          <Row gutter={24} align="middle">
            <Col span={6} style={{ textAlign: 'center' }}>
              <Progress type="circle" percent={total} format={() => `${total}`}
                strokeColor={total >= 80 ? '#52c41a' : total >= 60 ? '#faad14' : '#ff4d4f'} size={100} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>满分100</div>
            </Col>
            <Col span={18}>
              {ai_score?.breakdown && Object.entries(ai_score.breakdown).map(([key, val]: any) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <Row justify="space-between">
                    <Text style={{ fontSize: 13 }}>{val.comment}</Text>
                    <Text strong style={{ color: scoreColor(val.score, val.max) }}>{val.score}/{val.max}</Text>
                  </Row>
                  <Progress percent={Math.round(val.score / val.max * 100)} size="small"
                    strokeColor={scoreColor(val.score, val.max)} showInfo={false} />
                </div>
              ))}
            </Col>
          </Row>
          <Alert style={{ marginTop: 12 }}
            message={<><Text strong>AI摘要预测：</Text><Text>{ai_score?.ai_summary_prediction}</Text></>}
            type="info" showIcon />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{ai_score?.overall_comment}</Text>
        </Card>

        {/* 关键词缺口 */}
        <Card title="关键词缺口分析">
          <div style={{ marginBottom: 8 }}>
            <Text strong>竞品有但你缺失的高价值词：</Text>
            <div style={{ marginTop: 6 }}>
              {(keyword_gaps?.missing_high_value || []).map((w: string) => (
                <Tag key={w} color="red" style={{ marginBottom: 4 }}>{w}</Tag>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text strong>位置需调整的词：</Text>
            <div style={{ marginTop: 6 }}>
              {(keyword_gaps?.weak_placement || []).map((w: string) => (
                <Tag key={w} color="orange" style={{ marginBottom: 4 }}>{w}</Tag>
              ))}
            </div>
          </div>
          <div>
            <Text strong>建议补充：</Text>
            <div style={{ marginTop: 6 }}>
              {(keyword_gaps?.suggestions || []).map((w: string) => (
                <Tag key={w} color="blue" style={{ marginBottom: 4 }}>{w}</Tag>
              ))}
            </div>
          </div>
        </Card>

        {/* VOC锚位 */}
        <Card title="VOC 买家诉求锚位">
          <Row gutter={16}>
            <Col span={12}>
              <Text strong style={{ color: '#52c41a' }}>
                <CheckCircleOutlined /> 已覆盖痛点
              </Text>
              <div style={{ marginTop: 8 }}>
                {(voc_anchors?.pain_points_addressed || []).map((p: string) => (
                  <div key={p} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>✓ {p}</div>
                ))}
              </div>
            </Col>
            <Col span={12}>
              <Text strong style={{ color: '#ff4d4f' }}>
                <ExclamationCircleOutlined /> 未覆盖痛点
              </Text>
              <div style={{ marginTop: 8 }}>
                {(voc_anchors?.pain_points_missing || []).map((p: string) => (
                  <div key={p} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>✗ {p}</div>
                ))}
              </div>
            </Col>
          </Row>
          {(voc_anchors?.scene_gaps || []).length > 0 && (
            <Alert style={{ marginTop: 12 }}
              message={`缺失使用场景：${voc_anchors.scene_gaps.join(' / ')}`}
              type="warning" showIcon />
          )}
        </Card>

        {/* 合规检查 */}
        <Card title={<><WarningOutlined style={{ color: compliance?.safe ? '#52c41a' : '#ff4d4f', marginRight: 6 }} />合规检查</>}>
          {compliance?.safe
            ? <Alert message="未发现明显合规风险" type="success" showIcon />
            : (compliance?.violations || []).map((v: any, i: number) => (
              <Alert key={i} style={{ marginBottom: 8 }}
                message={<><Tag color={v.severity === '高' ? 'red' : v.severity === '中' ? 'orange' : 'default'}>{v.severity}</Tag>{v.type}：{v.content}</>}
                description={`建议：${v.fix}`} type="error" showIcon />
            ))
          }
          {(compliance?.risks || []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              {compliance.risks.map((r: string, i: number) => (
                <Alert key={i} message={r} type="warning" showIcon style={{ marginBottom: 4 }} />
              ))}
            </div>
          )}
        </Card>

        <Button type="primary" size="large" onClick={() => setCurrentStep(2)} disabled={!optimized}>
          查看优化方案 →
        </Button>
      </div>
    )
  }

  function renderStep2() {
    if (!optimized) return <Alert message="请先完成诊断" type="warning" showIcon />
    const { optimized_title, optimized_bullets, ai_summary_after, score_improvement, search_terms } = optimized

    return (
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 评分提升 */}
        <Alert message={<><Text strong>评分提升预测：</Text>{score_improvement}</>}
          description={<><Text strong>优化后AI摘要：</Text>{ai_summary_after}</>}
          type="success" showIcon />

        {/* 标题优化 */}
        <Card title="标题优化方案">
          <div style={{ marginBottom: 12 }}>
            <Tag color="blue">A版 · 功能导向</Tag>
            <Paragraph copyable style={{ marginTop: 6, padding: 10, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
              {optimized_title?.a_version}
            </Paragraph>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Tag color="purple">B版 · 场景导向</Tag>
            <Paragraph copyable style={{ marginTop: 6, padding: 10, background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 6 }}>
              {optimized_title?.b_version}
            </Paragraph>
          </div>
          <div>
            <Text strong>改动说明：</Text>
            {(optimized_title?.changes || []).map((c: string, i: number) => (
              <div key={i} style={{ fontSize: 13, color: '#555', padding: '2px 0' }}>· {c}</div>
            ))}
          </div>
        </Card>

        {/* 五点优化 */}
        <Card title="五点描述优化">
          {(optimized_bullets || []).map((b: any, i: number) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < 4 ? '1px solid #f0f0f0' : 'none' }}>
              <Row gutter={12}>
                <Col span={11}>
                  <Tag color="red" style={{ marginBottom: 6 }}>原文</Tag>
                  <div style={{ fontSize: 13, color: '#999', padding: 8, background: '#fff2f0', borderRadius: 4 }}>{b.original || '—'}</div>
                </Col>
                <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>→</Col>
                <Col span={11}>
                  <Tag color="green" style={{ marginBottom: 6 }}>优化后</Tag>
                  <Paragraph copyable style={{ fontSize: 13, padding: 8, background: '#f6ffed', borderRadius: 4, margin: 0 }}>
                    {b.optimized}
                  </Paragraph>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>改动原因：{b.reason}</Text>
            </div>
          ))}
        </Card>

        {/* Search Terms */}
        {search_terms && (
          <Card title="补充后台关键词 (Search Terms)">
            <Paragraph copyable style={{ padding: 10, background: '#fafafa', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}>
              {search_terms}
            </Paragraph>
          </Card>
        )}

        <Button type="primary" size="large" onClick={() => setCurrentStep(3)}>进入导出 →</Button>
      </div>
    )
  }

  function renderStep3() {
    if (!diagnosis && !optimized) return <Alert message="请先完成诊断和优化" type="warning" showIcon />

    function exportTXT() {
      const lines: string[] = ['=== Listing 优化报告 ===\n']
      if (diagnosis?.ai_score) {
        lines.push(`AI可读性评分：${diagnosis.ai_score.total}/100`)
        lines.push(`AI摘要预测（优化前）：${diagnosis.ai_score.ai_summary_prediction}\n`)
      }
      if (optimized) {
        lines.push('--- 优化后标题 ---')
        lines.push(`A版：${optimized.optimized_title?.a_version}`)
        lines.push(`B版：${optimized.optimized_title?.b_version}\n`)
        lines.push('--- 优化后五点 ---')
        ;(optimized.optimized_bullets || []).forEach((b: any, i: number) => {
          lines.push(`Bullet ${i+1}：${b.optimized}`)
        })
        lines.push(`\n优化后AI摘要：${optimized.ai_summary_after}`)
        lines.push(`评分提升：${optimized.score_improvement}`)
        if (optimized.search_terms) lines.push(`\nSearch Terms：${optimized.search_terms}`)
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'listing_optimization.txt'; a.click()
      URL.revokeObjectURL(url)
    }

    return (
      <Card title="4. 导出" style={{ maxWidth: 600, margin: '0 auto' }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert message="诊断和优化已完成，可导出完整报告" type="success" showIcon />
          <Button block size="large" onClick={exportTXT} icon={<CheckCircleOutlined />}>
            导出优化报告 TXT
          </Button>
          <Button block onClick={() => { setCurrentStep(0); setDiagnosis(null); setOptimized(null); form.resetFields() }}>
            重新分析
          </Button>
        </Space>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)', background: '#f5f5f7' }}>
      {/* 左侧导航 */}
      <div style={{ width: 180, background: '#fff', borderRight: '1px solid #e8e8e8', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13, color: '#0071e3' }}>文案优化</Text>
        </div>
        {STEPS.map((label, i) => (
          <div key={i} onClick={() => { if (i <= currentStep) setCurrentStep(i) }}
            style={{
              padding: '10px 20px', cursor: i <= currentStep ? 'pointer' : 'default',
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

      {/* 主内容 */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {currentStep === 0 && renderStep0()}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </div>
    </div>
  )
}
