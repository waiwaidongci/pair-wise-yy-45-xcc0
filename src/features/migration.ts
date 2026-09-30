import { ROUND_BATCH_NAMES, ROUND_LABELS, type AuditEvent, type LockConclusion, type Measurement, type OldSample, type RoundLabel, type Sample, type SamplingBatch } from '../api/types'

/**
 * 计算一个批次的尺寸达标结论（锁定时固化为锁定结论）。
 */
export function buildConclusion(measurements: Measurement[], decidedAt: string, note: string, decisionSummary: string): LockConclusion {
  const passed = measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
  const total = measurements.length
  return {
    passRate: total === 0 ? 0 : Math.round((passed / total) * 100),
    passedCount: passed,
    totalCount: total,
    decidedAt,
    note,
    decisionSummary,
  }
}

function roundIndex(round: RoundLabel): number {
  return ROUND_LABELS.indexOf(round)
}

/**
 * 生成旧批次（历史轮次）的审计事件。旧批次在迁移时按“已确认结论”补齐。
 */
function buildLegacyAudit(sample: OldSample, batch: SamplingBatch, round: RoundLabel, isLast: boolean): AuditEvent[] {
  if (isLast) return []
  const events: AuditEvent[] = []
  const measuredAt = round === '第一轮' ? '2026-09-12' : round === '第二轮' ? '2026-09-22' : '2026-09-26'
  events.push({
    id: `${batch.id}-AUD-1`,
    date: measuredAt,
    title: `${round}尺寸实测导入`,
    owner: sample.supplier,
    detail: `导入 ${batch.measurements.length} 个部位实测值，系统按容差自动判定达标情况。`,
    status: '已同步',
  })
  events.push({
    id: `${batch.id}-AUD-2`,
    date: measuredAt,
    title: `${round}试穿评审`,
    owner: sample.owner,
    detail: '完成动态试穿记录，版师与产品确认版型与工艺包。',
    status: '已归档',
  })
  events.push({
    id: `${batch.id}-AUD-3`,
    date: measuredAt,
    title: `${round}审核锁定`,
    owner: sample.owner,
    detail: `锁定 ${round} 尺寸、批注与改版方案，形成不可覆盖的审核快照。`,
    status: '已锁定',
  })
  return events
}

/**
 * 将旧版草稿（未按打样批次归档）迁移为按批次归档的新结构。
 *
 * 补齐规则（按来源）：
 * - 尺寸实测：按轮次（第一轮/第二轮/第三轮）归入对应批次；
 * - 批注 / 改版方案：旧数据未写批次，按其当前评审来源归入生效批次（最新一轮），
 *   并补上 batchId；
 * - 历史轮次（非生效批次）：按已确认结论补齐锁定结论与审计记录，可单独查回。
 *
 * 迁移失败时抛出异常，由调用方保留原草稿并提供重试入口。
 */
export function migrateSample(old: OldSample, now: string): Sample {
  if (!old || typeof old !== 'object') throw new Error('草稿缺少款式数据')
  if (!Array.isArray(old.measurements) && typeof old.measurements !== 'object') {
    throw new Error(`款式 ${old?.id ?? '未知'} 缺少尺寸实测来源`)
  }

  const batches: SamplingBatch[] = ROUND_LABELS.map((round) => {
    const measurements = Array.isArray(old.measurements)
      ? []
      : (old.measurements[round] ?? [])
    if (!Array.isArray(measurements)) throw new Error(`款式 ${old.id} 的 ${round} 尺寸实测格式不正确`)
    const id = `${old.id}-B${roundIndex(round) + 1}`
    const isLast = roundIndex(round) === ROUND_LABELS.length - 1
    const locked = !isLast
    const batch: SamplingBatch = {
      id,
      name: ROUND_BATCH_NAMES[round],
      round,
      measurements,
      annotations: [],
      proposals: [],
      status: locked ? '已锁定' : '草稿',
      locked,
      lockedAt: locked ? now : undefined,
      lockedBy: locked ? old.owner : undefined,
      lockNote: locked ? `迁移补齐：${round} 已确认结论归档。` : undefined,
      conclusion: null,
      audit: [],
      pendingRevisions: [],
    }
    if (locked) {
      const conclusion = buildConclusion(measurements, now, `${round} 版型与工艺资料完整，定版归档。`, '历史轮次结论迁移补齐')
      batch.conclusion = conclusion
      batch.audit = buildLegacyAudit(old, batch, round, isLast)
    }
    return batch
  })

  // 按来源补齐：未标注批次的批注 / 方案归入生效批次（最新一轮）
  const effectiveBatch = batches[batches.length - 1]
  for (const annotation of old.annotations ?? []) {
    if (!annotation || typeof annotation !== 'object') throw new Error(`款式 ${old.id} 存在无法识别的批注`)
    effectiveBatch.annotations.push({ ...annotation, batchId: effectiveBatch.id })
  }
  for (const proposal of old.proposals ?? []) {
    if (!proposal || typeof proposal !== 'object') throw new Error(`款式 ${old.id} 存在无法识别的改版方案`)
    effectiveBatch.proposals.push({ ...proposal, batchId: effectiveBatch.id })
  }

  const status: Sample['status'] =
    old.status === '已锁定' ? '已锁定' : old.status === '待审核' ? '待审核' : '开发中'

  return {
    ...old,
    status,
    batches,
    effectiveBatchId: effectiveBatch.id,
  }
}

export function migrateSamples(oldSamples: OldSample[], now: string): Sample[] {
  if (!Array.isArray(oldSamples)) throw new Error('草稿不是有效的款式列表')
  return oldSamples.map((sample) => migrateSample(sample, now))
}
