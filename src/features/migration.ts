import { fingerprintOf } from '../api/seed'
import type {
  Annotation,
  AuditEntry,
  BatchConclusion,
  Decision,
  Measurement,
  RevisionProposal,
  RoundId,
  Sample,
  SampleBatch,
} from '../api/types'
import { ROUND_IDS } from '../api/types'

/** v1 旧草稿：尺寸/批注/方案混在同一份草稿、没有批次归属 */
type LegacySample = {
  id?: unknown
  status?: unknown
  measurements?: Record<string, Measurement[]>
  annotations?: Annotation[]
  proposals?: RevisionProposal[]
  [key: string]: unknown
}

type LegacyState = {
  samples?: LegacySample[]
  selectedId?: string
  roundA?: RoundId
  roundB?: RoundId
  decisions?: Decision[]
  draftNotes?: Record<string, string>
  locked?: boolean
}

type NewSample = Sample

const roundHint = (text: string): RoundId | null => {
  if (text.includes('第三轮') || text.includes('三轮')) return '第三轮'
  if (text.includes('第二轮') || text.includes('二轮')) return '第二轮'
  if (text.includes('第一轮') || text.includes('首轮') || text.includes('一轮')) return '第一轮'
  return null
}

const assertValidMeasurements = (measurements: unknown, sampleId: string): Record<RoundId, Measurement[]> => {
  if (!measurements || typeof measurements !== 'object') {
    throw new Error(`款式 ${sampleId} 缺少尺寸实测数据，无法按批次归档`)
  }
  const record = measurements as Record<string, unknown>
  for (const round of ROUND_IDS) {
    const list = record[round]
    if (!Array.isArray(list)) {
      throw new Error(`款式 ${sampleId} 的「${round}」尺寸表损坏（应为数组），迁移中止`)
    }
    for (const item of list as Measurement[]) {
      if (!item || typeof item.key !== 'string' || typeof item.actual !== 'number' || typeof item.spec !== 'number') {
        throw new Error(`款式 ${sampleId} 的「${round}」存在无法识别的尺寸记录，迁移中止`)
      }
    }
  }
  return measurements as Record<RoundId, Measurement[]>
}

const synthesizeConclusion = (
  batch: Pick<SampleBatch, 'measurements' | 'proposals' | 'decisions'>,
  lockedAt: string,
  note: string,
  era: number,
): BatchConclusion => {
  const passedCount = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
  return {
    lockedAt,
    lockedBy: '系统迁移',
    note,
    fingerprint: fingerprintOf(batch.measurements, batch.proposals, batch.decisions),
    valid: true,
    passedCount,
    totalCount: batch.measurements.length,
    era,
  }
}

export type MigrationResult = {
  samples: NewSample[]
  selectedId: string
  roundA: RoundId
  roundB: RoundId
  batchesFilled: number
}

/**
 * 首次打开迁移：旧数据没写批次，按来源补齐归属。
 * - 尺寸：来源就是旧的三轮 key，原样归档到对应批次；
 * - 批注：内容能识别轮次按内容，否则已解决归基准轮、待处理归当前评审轮；
 * - 方案：内容能识别轮次按内容，否则待决定归当前评审轮、已决定归基准轮；
 * - 决定随方案走；草稿随当前评审轮。
 * 任一结构校验失败抛错，由调用方保留原草稿并提供重试入口。
 */
export const migrateLegacyState = (raw: string): MigrationResult => {
  let parsed: LegacyState
  try {
    parsed = JSON.parse(raw) as LegacyState
  } catch {
    throw new Error('旧草稿 JSON 无法解析，文件可能已损坏')
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.samples)) {
    throw new Error('旧草稿缺少 samples 列表，结构与 v1 不匹配')
  }

  const roundA: RoundId = ROUND_IDS.includes(parsed.roundA as RoundId) ? (parsed.roundA as RoundId) : '第二轮'
  const roundB: RoundId = ROUND_IDS.includes(parsed.roundB as RoundId) ? (parsed.roundB as RoundId) : '第三轮'
  let batchesFilled = 0

  const samples: NewSample[] = parsed.samples.map((legacy, sampleIndex) => {
    if (typeof legacy.id !== 'string' || !legacy.id.trim()) {
      throw new Error(`第 ${sampleIndex + 1} 个款式缺少 id，无法迁移`)
    }
    const sampleId = legacy.id
    const measurements = assertValidMeasurements(legacy.measurements, sampleId)

    const annotationBatch = (annotation: Annotation): RoundId =>
      roundHint(`${annotation.part}${annotation.content}`) ?? (annotation.status === '已解决' ? roundA : roundB)
    const proposalBatch = (proposal: RevisionProposal): RoundId =>
      roundHint(`${proposal.affectedPart}${proposal.content}`) ?? (proposal.status === '待决定' ? roundB : roundA)

    const annotationsByRound: Record<RoundId, Annotation[]> = { 第一轮: [], 第二轮: [], 第三轮: [] }
    const proposalsByRound: Record<RoundId, RevisionProposal[]> = { 第一轮: [], 第二轮: [], 第三轮: [] }
    for (const annotation of legacy.annotations ?? []) {
      if (!annotation || typeof annotation.id !== 'string') {
        throw new Error(`款式 ${sampleId} 存在缺少 id 的批注，迁移中止`)
      }
      const batchId = annotationBatch(annotation)
      annotationsByRound[batchId].push({ ...annotation, batchId })
      batchesFilled += 1
    }
    for (const proposal of legacy.proposals ?? []) {
      if (!proposal || typeof proposal.id !== 'string') {
        throw new Error(`款式 ${sampleId} 存在缺少 id 的改版方案，迁移中止`)
      }
      const batchId = proposalBatch(proposal)
      proposalsByRound[batchId].push({ ...proposal, batchId })
      batchesFilled += 1
    }

    const legacyStatus = legacy.status === '开发中' || legacy.status === '待审核' || legacy.status === '已锁定' ? legacy.status : '开发中'
    const effectiveIndex = ROUND_IDS.indexOf(roundB)
    const globalLocked = parsed.locked === true && sampleIndex === 0

    const batches = {} as Record<RoundId, SampleBatch>
    ROUND_IDS.forEach((roundId, index) => {
      const annotations = annotationsByRound[roundId]
      const proposals = proposalsByRound[roundId]
      const decisions = (parsed.decisions ?? []).filter((decision) =>
        proposals.some((proposal) => proposal.id === decision.proposalId),
      )
      const notes = roundId === roundB ? parsed.draftNotes?.[sampleId] ?? '' : ''

      let status: SampleBatch['status']
      if (index < effectiveIndex) status = '已锁定'
      else if (index === effectiveIndex) status = globalLocked ? '已锁定' : legacyStatus
      else status = '未开始'

      const audit: AuditEntry[] = []
      annotations.forEach((annotation) => {
        audit.push({
          id: `AU-MIG-${annotation.id}`,
          date: '2026-09-27',
          title: `${annotation.part}批注`,
          owner: annotation.author,
          detail: annotation.content,
          status: annotation.status,
          era: 1,
        })
      })
      proposals.forEach((proposal) => {
        audit.push({
          id: `AU-MIG-${proposal.id}`,
          date: '2026-09-27',
          title: `${proposal.affectedPart}改版方案`,
          owner: proposal.author,
          detail: proposal.content,
          status: proposal.status,
          era: 1,
        })
      })
      decisions.forEach((decision) => {
        audit.push({
          id: `AU-MIG-D-${decision.proposalId}`,
          date: decision.decidedAt,
          title: `方案 ${decision.proposalId} ${decision.decision}`,
          owner: '品类负责人',
          detail: decision.reason,
          status: '已记录',
          era: 1,
        })
      })

      const locked = status === '已锁定'
      if (locked) {
        audit.push({
          id: `AU-MIG-L-${roundId}-${sampleId}`,
          date: '2026-09-27',
          title: `${roundId}审核锁定`,
          owner: '系统迁移',
          detail: '旧草稿迁移：按来源补齐批次后，重建该批次的有效锁定结论。',
          status: '已锁定',
          era: 1,
        })
      }

      const base = { measurements: measurements[roundId], proposals, decisions }
      batches[roundId] = {
        id: roundId,
        status,
        measurements: measurements[roundId],
        annotations,
        proposals,
        decisions,
        notes,
        era: locked ? 1 : 0,
        conclusion: locked
          ? synthesizeConclusion(
              base,
              '2026-09-27 18:00',
              index < effectiveIndex
                ? `旧批次结论迁移归档：${roundId}评审已完成，结论保留可单独查回。`
                : '迁移前已审核锁定，结论按原草稿重建。',
              1,
            )
          : null,
        audit,
      }
    })

    return {
      ...(legacy as Omit<Sample, 'batches'>),
      id: sampleId,
      status: undefined,
      batches,
      // 兜底字段，避免旧草稿缺附件/评论时渲染异常
      attachments: Array.isArray((legacy as Sample).attachments) ? (legacy as Sample).attachments : [],
      comments: Array.isArray((legacy as Sample).comments) ? (legacy as Sample).comments : [],
    } as unknown as NewSample
  })

  const selectedId =
    typeof parsed.selectedId === 'string' && samples.some((item) => item.id === parsed.selectedId)
      ? parsed.selectedId
      : samples[0]?.id
      ? samples[0].id
      : (() => {
          throw new Error('旧草稿中没有任何款式，无法迁移')
        })()

  return { samples, selectedId, roundA, roundB, batchesFilled }
}
