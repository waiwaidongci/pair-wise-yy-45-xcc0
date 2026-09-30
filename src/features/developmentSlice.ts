import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { loadDraft, retryMigration, saveDraft } from './persist'
import { buildConclusion } from './migration'
import { nextBatchLabel, type Annotation, type Measurement, type OldSample, type PendingRevision, type RevisionProposal, type Sample, type SamplingBatch } from '../api/types'

type Decision = {
  proposalId: string
  batchId: string
  decision: '已采纳' | '未采纳'
  reason: string
  decidedAt: string
}

type MigrationStatus = 'idle' | 'succeeded' | 'failed'

type DevelopmentState = {
  draftVersion: number
  migrationStatus: MigrationStatus
  migrationError: string | null
  legacyDraft: OldSample[] | null
  samples: Sample[]
  selectedId: string
  roundA: string
  roundB: string
  decisions: Decision[]
  draftNotes: Record<string, string>
  activeAnnotation: string | null
}

function now() {
  return new Date().toLocaleString('zh-CN')
}

function initialState(): DevelopmentState {
  const loaded = loadDraft()
  if (loaded.ok) {
    return {
      draftVersion: 2,
      migrationStatus: 'succeeded',
      migrationError: null,
      legacyDraft: null,
      samples: loaded.samples,
      selectedId: loaded.samples[0]?.id ?? '',
      roundA: '第二轮',
      roundB: '第三轮',
      decisions: [],
      draftNotes: {},
      activeAnnotation: null,
    }
  }
  // 迁移失败：保留原草稿，不覆盖，等待重试
  return {
    draftVersion: 1,
    migrationStatus: 'failed',
    migrationError: loaded.error,
    legacyDraft: loaded.legacyDraft,
    samples: [],
    selectedId: '',
    roundA: '第二轮',
    roundB: '第三轮',
    decisions: [],
    draftNotes: {},
    activeAnnotation: null,
  }
}

function findSample(state: DevelopmentState, sampleId: string): Sample | undefined {
  return state.samples.find((item) => item.id === sampleId)
}

function findBatch(sample: Sample | undefined, batchId: string | undefined): SamplingBatch | undefined {
  if (!sample) return undefined
  return sample.batches.find((batch) => batch.id === batchId)
}

/**
 * 由生效批次派生样品状态：锁定 → 已锁定；有未处理项 → 待审核；否则开发中。
 */
function deriveStatus(sample: Sample) {
  const effective = sample.batches.find((batch) => batch.id === sample.effectiveBatchId)
  if (!effective) return
  if (effective.locked) {
    sample.status = '已锁定'
    return
  }
  const hasPending =
    effective.annotations.some((item) => item.status === '待处理') ||
    effective.proposals.some((item) => item.status === '待决定') ||
    effective.pendingRevisions.some((item) => item.status === '待审')
  sample.status = hasPending ? '待审核' : '开发中'
}

/**
 * 尺寸或方案变化后，使该批锁定结论与审计记录失效并重新计算。
 */
function invalidateBatch(sample: Sample, batch: SamplingBatch, reason: string) {
  if (!batch.locked && !batch.conclusion) return
  batch.locked = false
  batch.status = '草稿'
  batch.conclusion = null
  batch.audit = [
    {
      id: `${batch.id}-AUD-INV-${Date.now()}`,
      date: now(),
      title: '锁定结论失效',
      owner: '系统',
      detail: `${reason}，已锁定结论与审计记录作废，需重新评审锁定。`,
      status: '已失效',
    },
  ]
  deriveStatus(sample)
}

/**
 * 结转待审修订：若来源批次之后还没有新批次，则创建下一批（复制尺寸实测，
 * 不触碰已锁定批次的任何内容），并把修订应用到新批次。
 */
function ensureNextBatch(sample: Sample, source: SamplingBatch): SamplingBatch {
  const index = sample.batches.findIndex((batch) => batch.id === source.id)
  const existing = sample.batches[index + 1]
  if (existing) return existing
  const label = nextBatchLabel(sample.batches)
  const next: SamplingBatch = {
    id: `${sample.id}-B${sample.batches.length + 1}`,
    name: label.name,
    round: label.round,
    // measurements 为扁平结构，逐项复制即可；勿对 Immer 草稿使用 structuredClone
    measurements: source.measurements.map((m) => ({ ...m })),
    annotations: [],
    proposals: [],
    status: '草稿',
    locked: false,
    conclusion: null,
    audit: [],
    pendingRevisions: [],
  }
  sample.batches.push(next)
  return next
}

function applyRevision(target: SamplingBatch, revision: PendingRevision) {
  const payload = revision.payload
  const id = `${revision.kind === '批注' ? 'AN' : revision.kind === '改版方案' ? 'RV' : 'MS'}-${Date.now()}`
  if (payload.type === 'annotation') {
    const annotation: Annotation = {
      id,
      author: '当前用户',
      status: '待处理',
      batchId: target.id,
      ...payload.draft,
    }
    target.annotations.push(annotation)
  } else if (payload.type === 'proposal') {
    const proposal: RevisionProposal = {
      id,
      status: '待决定',
      batchId: target.id,
      ...payload.draft,
    }
    target.proposals.push(proposal)
  } else if (payload.type === 'measurement') {
    const measurement = target.measurements.find((item) => item.key === payload.key)
    if (measurement) measurement.actual = payload.actual
  }
}

const slice = createSlice({
  name: 'development',
  initialState: initialState(),
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.activeAnnotation = null
    },
    setRounds(state, action: PayloadAction<{ a?: string; b?: string }>) {
      if (action.payload.a) state.roundA = action.payload.a
      if (action.payload.b) state.roundB = action.payload.b
    },
    decideProposal(
      state,
      action: PayloadAction<{ sampleId: string; batchId: string; proposalId: string; decision: '已采纳' | '未采纳'; reason: string }>,
    ) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      const proposal = batch.proposals.find((item) => item.id === action.payload.proposalId)
      if (!proposal) return
      // 方案变化：该批若已锁定，结论与审计失效
      invalidateBatch(sample, batch, `改版方案 ${proposal.affectedPart} 作出${action.payload.decision}决定`)
      proposal.status = action.payload.decision
      state.decisions.push({
        proposalId: proposal.id,
        batchId: batch.id,
        decision: action.payload.decision,
        reason: action.payload.reason,
        decidedAt: now(),
      })
      deriveStatus(sample)
    },
    saveDraftNote(state, action: PayloadAction<{ sampleId: string; batchId: string; notes: string }>) {
      state.draftNotes[`${action.payload.sampleId}:${action.payload.batchId}`] = action.payload.notes
    },
    toggleAnnotation(state, action: PayloadAction<string | null>) {
      state.activeAnnotation = action.payload
    },
    resolveAnnotation(state, action: PayloadAction<{ sampleId: string; batchId: string; annotationId: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      const annotation = batch?.annotations.find((item) => item.id === action.payload.annotationId)
      if (!annotation) return
      annotation.status = annotation.status === '待处理' ? '已解决' : '待处理'
      deriveStatus(sample!)
    },
    addAnnotation(state, action: PayloadAction<{ sampleId: string; batchId: string; draft: { x: number; y: number; part: string; content: string } }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      if (batch.locked) {
        // 已锁定：进入待审修订，不改动已确认内容
        batch.pendingRevisions.push({
          id: `PR-${Date.now()}`,
          kind: '批注',
          summary: `新增批注「${action.payload.draft.part}」`,
          createdAt: now(),
          status: '待审',
          payload: { type: 'annotation', draft: action.payload.draft },
        })
      } else {
        batch.annotations.push({
          id: `AN-${Date.now()}`,
          author: '当前用户',
          status: '待处理',
          batchId: batch.id,
          ...action.payload.draft,
        })
      }
      deriveStatus(sample)
    },
    addProposal(
      state,
      action: PayloadAction<{ sampleId: string; batchId: string; draft: { author: string; role: string; content: string; affectedPart: string } }>,
    ) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      if (batch.locked) {
        batch.pendingRevisions.push({
          id: `PR-${Date.now()}`,
          kind: '改版方案',
          summary: `新增改版方案「${action.payload.draft.affectedPart}」`,
          createdAt: now(),
          status: '待审',
          payload: { type: 'proposal', draft: action.payload.draft },
        })
      } else {
        batch.proposals.push({
          id: `RV-${Date.now()}`,
          status: '待决定',
          batchId: batch.id,
          ...action.payload.draft,
        })
      }
      deriveStatus(sample)
    },
    updateMeasurements(state, action: PayloadAction<{ sampleId: string; batchId: string; measurements: Measurement[]; reason?: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      batch.measurements = action.payload.measurements
      invalidateBatch(sample, batch, action.payload.reason ?? '尺寸实测调整')
      deriveStatus(sample)
    },
    lockBatch(state, action: PayloadAction<{ sampleId: string; batchId: string; note: string; lockedBy?: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      const decidedAt = now()
      const conclusion = buildConclusion(
        batch.measurements,
        decidedAt,
        action.payload.note,
        `采纳 ${batch.proposals.filter((item) => item.status === '已采纳').length} 项方案，关闭 ${batch.annotations.filter((item) => item.status === '已解决').length} 项批注`,
      )
      batch.locked = true
      batch.status = '已锁定'
      batch.lockedAt = decidedAt
      batch.lockedBy = action.payload.lockedBy ?? '当前用户'
      batch.lockNote = action.payload.note
      batch.conclusion = conclusion
      batch.audit.push({
        id: `${batch.id}-AUD-LOCK-${Date.now()}`,
        date: decidedAt,
        title: `${batch.round}审核锁定`,
        owner: batch.lockedBy,
        detail: `锁定 ${batch.round} 尺寸、批注与改版方案，达标率 ${conclusion.passRate}%，形成审核快照。`,
        status: '已锁定',
      })
      deriveStatus(sample)
    },
    unlockBatch(state, action: PayloadAction<{ sampleId: string; batchId: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      if (!sample || !batch) return
      batch.locked = false
      batch.status = '草稿'
      batch.conclusion = null
      batch.audit.push({
        id: `${batch.id}-AUD-UNLOCK-${Date.now()}`,
        date: now(),
        title: `${batch.round}解锁修订`,
        owner: '当前用户',
        detail: '解锁后新增修订将进入待审，已确认结论保留备查。',
        status: '已解锁',
      })
      deriveStatus(sample)
    },
    approveRevision(state, action: PayloadAction<{ sampleId: string; batchId: string; revisionId: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const source = findBatch(sample, action.payload.batchId)
      if (!sample || !source) return
      const revision = source.pendingRevisions.find((item) => item.id === action.payload.revisionId)
      if (!revision || revision.status !== '待审') return
      const target = ensureNextBatch(sample, source)
      applyRevision(target, revision)
      revision.status = '已通过'
      sample.effectiveBatchId = target.id
      // 切换到新生效批次，便于查看结转结果
      state.roundB = target.round
      deriveStatus(sample)
    },
    rejectRevision(state, action: PayloadAction<{ sampleId: string; batchId: string; revisionId: string }>) {
      const sample = findSample(state, action.payload.sampleId)
      const batch = findBatch(sample, action.payload.batchId)
      const revision = batch?.pendingRevisions.find((item) => item.id === action.payload.revisionId)
      if (!revision || revision.status !== '待审') return
      revision.status = '已驳回'
      deriveStatus(sample!)
    },
    retryMigrationAction(state, action: PayloadAction<{ forceSeed?: boolean } | undefined>) {
      const legacy = action.payload?.forceSeed ? null : state.legacyDraft
      const result = retryMigration(legacy)
      if (result.ok) {
        state.draftVersion = 2
        state.migrationStatus = 'succeeded'
        state.migrationError = null
        state.legacyDraft = null
        state.samples = result.samples
        state.selectedId = result.samples[0]?.id ?? ''
      } else {
        state.migrationStatus = 'failed'
        state.migrationError = result.error
        state.legacyDraft = result.legacyDraft ?? state.legacyDraft
      }
    },
  },
})

export const {
  selectSample,
  setRounds,
  decideProposal,
  saveDraftNote,
  toggleAnnotation,
  resolveAnnotation,
  addAnnotation,
  addProposal,
  updateMeasurements,
  lockBatch,
  unlockBatch,
  approveRevision,
  rejectRevision,
  retryMigrationAction,
} = slice.actions

export const developmentReducer = slice.reducer

export { saveDraft as persistDraft }
