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
  batchId: RoundId
}

export type RevisionProposal = {
  id: string
  author: string
  role: string
  content: string
  affectedPart: string
  status: '待决定' | '已采纳' | '未采纳'
  batchId: RoundId
}

export type RoundId = '第一轮' | '第二轮' | '第三轮'
export const ROUND_IDS: RoundId[] = ['第一轮', '第二轮', '第三轮']

/** 打样批次（一轮样衣独立归档） */
export type SampleBatch = {
  id: RoundId
  status: '未开始' | '开发中' | '待审核' | '已锁定'
  /** 该批次的尺寸实测 */
  measurements: Measurement[]
  /** 已确认的部位批注（按批次归档） */
  annotations: Annotation[]
  /** 已确认的替代改版方案（按批次归档） */
  proposals: RevisionProposal[]
  /** 方案采纳决定（按批次归档） */
  decisions: Decision[]
  /** 该批次的评审草稿 */
  notes: string
  /** 审核锁定结论；批次尺寸/方案变化后失效，需重新计算并锁定 */
  conclusion: BatchConclusion | null
  /** 锁定时代，每次锁定递增；结论失效时早于当前 era 的审计条目标记作废 */
  era: number
  /** 该批次审计记录（结论失效后旧记录保留并标记 invalid） */
  audit: AuditEntry[]
}

export type Decision = {
  proposalId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
}

export type BatchConclusion = {
  lockedAt: string
  lockedBy: string
  note: string
  /** 锁定时尺寸/方案的指纹；与当前内容不一致即判定结论失效 */
  fingerprint: string
  /** 结论所属锁定时代；批次重新计算后旧时代审计条目作废 */
  era: number
  /** 是否仍然生效（尺寸或方案变化后置为 false） */
  valid: boolean
  invalidatedAt?: string
  invalidReason?: string
  /** 锁定时计算的达标部位数/总部位数 */
  passedCount: number
  totalCount: number
}

export type AuditEntry = {
  id: string
  date: string
  title: string
  owner: string
  detail: string
  status: string
  /** 所属锁定时代；批次重新计算后，旧时代的条目标记作废 */
  era: number
  invalid?: boolean
}

/** 待审修订：批次锁定后，新增或修正先进待审，不直接改已确认内容 */
export type PendingRevision = {
  id: string
  batchId: RoundId
  kind: 'measurement' | 'annotation' | 'proposal'
  action: '修正' | '新增'
  summary: string
  payload: unknown
  createdAt: string
  author: string
  status: '待审' | '已通过' | '已驳回'
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
  fabric: string
  colorway: string
  craft: string[]
  /** 尺寸实测、批注、改版方案均按打样批次分开归档 */
  batches: Record<RoundId, SampleBatch>
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
}
