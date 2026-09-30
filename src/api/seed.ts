import type { Annotation, Measurement, RevisionProposal, RoundId, Sample, SampleBatch } from './types'
import { ROUND_IDS } from './types'

const measurements = (offset = 0): Measurement[] => [
  { key: 'chest', name: '胸围', spec: 108, actual: 108 + offset, tolerance: 1.5 },
  { key: 'waist', name: '腰围', spec: 94, actual: 94 + offset * 0.7, tolerance: 1.5 },
  { key: 'hem', name: '下摆围', spec: 112, actual: 112 + offset * 1.2, tolerance: 2 },
  { key: 'length', name: '后衣长', spec: 72, actual: 71.6 + offset, tolerance: 1 },
  { key: 'shoulder', name: '肩宽', spec: 48, actual: 48.3 + offset * 0.5, tolerance: 1 },
  { key: 'sleeve', name: '袖长', spec: 61, actual: 60.7 + offset, tolerance: 1 },
]

const buildBatch = (
  id: RoundId,
  part: {
    status: SampleBatch['status']
    measurements: Measurement[]
    annotations?: Annotation[]
    proposals?: RevisionProposal[]
    notes?: string
    lockedAt?: string
    lockedNote?: string
    audit?: SampleBatch['audit']
  },
): SampleBatch => {
  const annotations = part.annotations ?? []
  const proposals = part.proposals ?? []
  const decisions = proposals
    .filter((item) => item.status !== '待决定')
    .map((item) => ({
      proposalId: item.id,
      decision: item.status as '已采纳' | '未采纳',
      reason: '历史批次复核结论，迁移时由来源批次归档。',
      decidedAt: part.lockedAt ?? '2026-09-24 18:00',
    }))
  const passedCount = part.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
  const locked = part.status === '已锁定'
  const fingerprint = fingerprintOf(part.measurements, proposals, decisions)
  return {
    id,
    status: part.status,
    measurements: part.measurements,
    annotations,
    proposals,
    decisions,
    notes: part.notes ?? '',
    era: locked ? 1 : 0,
    conclusion: locked
      ? {
          lockedAt: part.lockedAt ?? '2026-09-24 18:00',
          lockedBy: '沈岚',
          note: part.lockedNote ?? `${id}样衣评审完成，结论归档保留。`,
          fingerprint,
          valid: true,
          era: 1,
          passedCount,
          totalCount: part.measurements.length,
        }
      : null,
    audit: part.audit ?? [],
  }
}

/** 批次尺寸 + 方案 + 决定的指纹；任一变化都会使旧锁定结论失效 */
export const fingerprintOf = (
  measurements: Measurement[],
  proposals: RevisionProposal[],
  decisions: { proposalId: string; decision: string }[],
): string => {
  const m = measurements.map((item) => `${item.key}:${item.actual.toFixed(2)}`).join('|')
  const p = proposals.map((item) => `${item.id}:${item.status}:${item.content}`).join('|')
  const d = decisions.map((item) => `${item.proposalId}:${item.decision}`).join('|')
  return `${m}#${p}#${d}`
}

export const seedSamples: Sample[] = [
  {
    id: 'SMP-26018',
    styleCode: 'WR-26AW-018',
    styleName: '海盐弧线工装外套',
    category: '女装 / 外套',
    developmentSeason: '2026 秋冬',
    supplier: '苏州明裁制衣',
    dueDate: '2026-10-12',
    owner: '沈岚',
    fabric: '三防棉锦 / 军绿色',
    colorway: '苔绿 18-0322 TCX',
    craft: ['斜向立体贴袋', '双针压线 0.6cm', '袖口暗扣'],
    batches: {
      第一轮: buildBatch('第一轮', {
        status: '已锁定',
        measurements: measurements(2.6),
        annotations: [],
        proposals: [],
        lockedAt: '2026-09-20 17:40',
        lockedNote: '第一轮样衣整体偏大约 2cm，已锁定首轮结论并发起第二轮改版。',
        audit: [
          { id: 'AU-0101', date: '2026-09-18', title: '第一轮尺寸实测导入', owner: '苏州明裁制衣', detail: '导入 6 个部位实测值，系统发现 4 项超过容差。', status: '已同步', era: 1 },
          { id: 'AU-0102', date: '2026-09-20', title: '第一轮审核锁定', owner: '沈岚', detail: '首轮样衣整体偏大，结论归档，发起第二轮改版。', status: '已锁定', era: 1 },
        ],
      }),
      第二轮: buildBatch('第二轮', {
        status: '已锁定',
        measurements: measurements(0.8),
        annotations: [
          { id: 'AN-02', x: 42, y: 51, part: '腰节', content: '抽绳孔位比设计稿高 1.5cm，需要回落。', author: '周研 / 版师', status: '已解决', batchId: '第二轮' },
        ],
        proposals: [
          { id: 'RV-10', author: '周研', role: '版师', content: '腰节抽绳孔位整体回落 1.5cm，与设计稿对齐。', affectedPart: '腰节', status: '已采纳', batchId: '第二轮' },
        ],
        lockedAt: '2026-09-27 18:10',
        lockedNote: '第二轮腰节孔位问题已关闭，袖窿活动量改善，锁定后进入第三轮复核。',
        audit: [
          { id: 'AU-0201', date: '2026-09-25', title: '第二轮尺寸实测导入', owner: '苏州明裁制衣', detail: '导入 6 个部位实测值，系统发现 2 项超过容差。', status: '已同步', era: 1 },
          { id: 'AU-0202', date: '2026-09-26', title: '腰节批注', owner: '周研 / 版师', detail: '抽绳孔位比设计稿高 1.5cm，需要回落。', status: '已解决', era: 1 },
          { id: 'AU-0203', date: '2026-09-27', title: '腰节改版方案 已采纳', owner: '品类负责人', detail: '腰节抽绳孔位整体回落 1.5cm，与设计稿对齐。', status: '已记录', era: 1 },
          { id: 'AU-0204', date: '2026-09-27', title: '第二轮审核锁定', owner: '沈岚', detail: '腰节问题关闭，进入第三轮复核。', status: '已锁定', era: 1 },
        ],
      }),
      第三轮: buildBatch('第三轮', {
        status: '待审核',
        measurements: measurements(0.3),
        annotations: [
          { id: 'AN-01', x: 64, y: 24, part: '领口', content: '领尖略外翘，收窄 0.8cm 并增加领底衬。', author: '陈曼 / 产品', status: '待处理', batchId: '第三轮' },
        ],
        proposals: [
          { id: 'RV-01', author: '周研', role: '版师', content: '前片肩线内收 0.6cm，袖窿同步下落 0.3cm。', affectedPart: '肩袖', status: '待决定', batchId: '第三轮' },
          { id: 'RV-02', author: '沈岚', role: '产品开发', content: '维持袖长，仅调整袖山吃势，避免改变视觉比例。', affectedPart: '袖山', status: '待决定', batchId: '第三轮' },
        ],
        notes: '第三轮肩袖活动量已改善；建议采纳肩线内收方案，复核举臂舒适度。',
        audit: [
          { id: 'AU-0301', date: '2026-09-26', title: '第三轮尺寸实测导入', owner: '苏州明裁制衣', detail: '导入 6 个部位实测值，系统发现 2 项超过容差。', status: '已同步', era: 0 },
        ],
      }),
    },
    attachments: [
      { name: '第二轮正面.jpg', type: '样衣照片', owner: '沈岚' },
      { name: '尺寸实测_0926.xlsx', type: '尺寸表', owner: '苏州明裁' },
      { name: '试穿记录_试穿员B.pdf', type: '试穿记录', owner: '陈曼' },
    ],
    comments: [
      { id: 'CM-01', author: '陈曼', content: '袖窿活动量比第一轮改善，但抬手仍会带动前片。', date: '09-27 15:20' },
      { id: 'CM-02', author: '周研', content: '建议先采纳肩线修正方案，第三轮再确认动态舒适度。', date: '09-27 17:05' },
    ],
  },
  {
    id: 'SMP-26021',
    styleCode: 'WR-26AW-021',
    styleName: '岩灰轻量风衣',
    category: '女装 / 风衣',
    developmentSeason: '2026 秋冬',
    supplier: '宁波原野服饰',
    dueDate: '2026-10-18',
    owner: '陈曼',
    fabric: '高密尼龙 / 岩灰',
    colorway: '雾岩灰 17-4402 TCX',
    craft: ['隐形门襟', '后背防风片', '可拆腰带'],
    batches: {
      第一轮: buildBatch('第一轮', {
        status: '已锁定',
        measurements: measurements(1.4),
        annotations: [
          { id: 'AN-11', x: 54, y: 40, part: '门襟', content: '门襟压线偏移，检查模板定位。', author: '顾恺 / 质检', status: '已解决', batchId: '第一轮' },
        ],
        proposals: [
          { id: 'RV-11', author: '宁波原野', role: '供应商', content: '门襟增加定位钻眼，压线稳定性可控制在 ±0.2cm。', affectedPart: '门襟', status: '已采纳', batchId: '第一轮' },
        ],
        lockedAt: '2026-09-22 16:20',
        lockedNote: '首轮门襟偏移问题已采纳定位钻眼方案，锁定归档，跟进第二轮模板。',
        audit: [
          { id: 'AU-1101', date: '2026-09-21', title: '第一轮尺寸实测导入', owner: '宁波原野服饰', detail: '导入 6 个部位实测值。', status: '已同步', era: 1 },
          { id: 'AU-1102', date: '2026-09-22', title: '门襟批注', owner: '顾恺 / 质检', detail: '门襟压线偏移，检查模板定位。', status: '已解决', era: 1 },
          { id: 'AU-1103', date: '2026-09-22', title: '门襟改版方案 已采纳', owner: '品类负责人', detail: '门襟增加定位钻眼，压线稳定性可控制在 ±0.2cm。', status: '已记录', era: 1 },
          { id: 'AU-1104', date: '2026-09-22', title: '第一轮审核锁定', owner: '陈曼', detail: '门襟问题关闭，发起第二轮。', status: '已锁定', era: 1 },
        ],
      }),
      第二轮: buildBatch('第二轮', {
        status: '开发中',
        measurements: measurements(0.4),
        annotations: [],
        proposals: [],
        notes: '',
        audit: [],
      }),
      第三轮: buildBatch('第三轮', {
        status: '未开始',
        measurements: measurements(0).map((item) => ({ ...item, actual: 0 })),
        annotations: [],
        proposals: [],
        notes: '',
        audit: [],
      }),
    },
    attachments: [{ name: '第一轮背片.jpg', type: '样衣照片', owner: '陈曼' }],
    comments: [],
  },
]

/** 当前生效批次：最后一个已开始（非“未开始”）的批次；总览与历史只采用它 */
export const selectEffectiveBatch = (sample: Sample): SampleBatch => {
  for (let i = ROUND_IDS.length - 1; i >= 0; i -= 1) {
    if (sample.batches[ROUND_IDS[i]].status !== '未开始') return sample.batches[ROUND_IDS[i]]
  }
  return sample.batches[ROUND_IDS[0]]
}
