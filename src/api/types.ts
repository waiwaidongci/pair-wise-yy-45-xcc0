export type RoundLabel = '第一轮' | '第二轮' | '第三轮'

/**
 * 批次轮次标签：前三轮为固定轮次，结转待审修订后可产生第四轮及以后。
 */
export type BatchRound = RoundLabel | (string & {})

export const ROUND_LABELS: RoundLabel[] = ['第一轮', '第二轮', '第三轮']

export const ROUND_BATCH_NAMES: Record<RoundLabel, string> = {
  第一轮: '第一批',
  第二轮: '第二批',
  第三轮: '第三批',
}

export function nextBatchLabel(batches: Array<{ round: string }>): { name: string; round: string } {
  const n = batches.length + 1
  return { name: `第${toChineseOrdinal(n)}批`, round: `第${toChineseOrdinal(n)}轮` }
}

function toChineseOrdinal(n: number): string {
  const digits = '零一二三四五六七八九'
  if (n <= 9) return digits[n]
  if (n === 10) return '十'
  if (n < 20) return `十${digits[n - 10]}`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `${digits[tens]}十${ones === 0 ? '' : digits[ones]}`
  }
  return String(n)
}

export type Measurement = {
  key: string
  name: string
  spec: number
  actual: number
  tolerance: number
}

export type Annotation = {
  id: string
  x: number
  y: number
  part: string
  content: string
  author: string
  status: '待处理' | '已解决'
  batchId?: string
}

export type RevisionProposal = {
  id: string
  author: string
  role: string
  content: string
  affectedPart: string
  status: '待决定' | '已采纳' | '未采纳'
  batchId?: string
}

export type AuditEvent = {
  id: string
  date: string
  title: string
  owner: string
  detail: string
  status: string
}

export type PendingRevisionKind = '尺寸' | '批注' | '改版方案'

export type PendingRevisionPayload =
  | { type: 'annotation'; draft: { x: number; y: number; part: string; content: string } }
  | { type: 'proposal'; draft: { author: string; role: string; content: string; affectedPart: string } }
  | { type: 'measurement'; key: string; actual: number }

export type PendingRevision = {
  id: string
  kind: PendingRevisionKind
  summary: string
  createdAt: string
  status: '待审' | '已通过' | '已驳回'
  payload: PendingRevisionPayload
}

export type LockConclusion = {
  passRate: number
  passedCount: number
  totalCount: number
  decidedAt: string
  note: string
  decisionSummary: string
}

export type BatchStatus = '草稿' | '已锁定'

export type SamplingBatch = {
  id: string
  name: string
  round: BatchRound
  measurements: Measurement[]
  annotations: Annotation[]
  proposals: RevisionProposal[]
  status: BatchStatus
  locked: boolean
  lockedAt?: string
  lockedBy?: string
  lockNote?: string
  conclusion: LockConclusion | null
  audit: AuditEvent[]
  pendingRevisions: PendingRevision[]
}

export type Sample = {
  id: string
  styleCode: string
  styleName: string
  category: string
  developmentSeason: string
  supplier: string
  dueDate: string
  owner: string
  status: '开发中' | '待审核' | '已锁定'
  fabric: string
  colorway: string
  craft: string[]
  batches: SamplingBatch[]
  effectiveBatchId: string
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
}

/**
 * 旧版草稿结构（未按打样批次归档），用于首次打开时的数据迁移。
 */
export type OldSample = {
  id: string
  styleCode: string
  styleName: string
  category: string
  developmentSeason: string
  supplier: string
  dueDate: string
  owner: string
  status: '开发中' | '待审核' | '已锁定'
  fabric: string
  colorway: string
  craft: string[]
  measurements: Record<RoundLabel, Measurement[]>
  annotations: Annotation[]
  proposals: RevisionProposal[]
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
}
