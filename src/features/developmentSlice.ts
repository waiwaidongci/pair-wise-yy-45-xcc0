import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { fingerprintOf, seedSamples, selectEffectiveBatch } from '../api/seed'
import type {
  Annotation,
  AuditEntry,
  PendingRevision,
  RevisionProposal,
  RoundId,
  Sample,
  SampleBatch,
} from '../api/types'
import { ROUND_IDS } from '../api/types'
import { migrateLegacyState } from './migration'

type DecisionDraft = { proposalId: string; decision: '已采纳' | '未采纳'; reason: string; decidedAt: string }

type DevelopmentState = {
  version: 2
  samples: Sample[]
  selectedId: string
  /** 当前查看/编辑的打样批次（同时也是尺寸对比的对比批次） */
  selectedBatch: RoundId
  /** 尺寸对比的基准批次 */
  roundA: RoundId
  activeAnnotation: string | null
  /** 待审修订（锁定后的新增/修正先进这里） */
  pendingRevisions: PendingRevision[]
  migration: { status: 'idle' } | { status: 'failed'; error: string }
}

const legacyKey = 'garment-sampling-draft-v1'
const migrationMetaKey = 'garment-sampling-migration-v1'
const storageKey = 'garment-sampling-batches-v2'

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const nowText = () => new Date().toLocaleString('zh-CN', { hour12: false })

const getSample = (state: DevelopmentState): Sample =>
  state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
const getBatch = (state: DevelopmentState): SampleBatch => {
  const sample = getSample(state)
  return sample.batches[state.selectedBatch] ?? selectEffectiveBatch(sample)
}

const pushAudit = (batch: SampleBatch, entry: Omit<AuditEntry, 'id' | 'date' | 'owner' | 'era' | 'status'> & Partial<Pick<AuditEntry, 'date' | 'owner' | 'status'>>) => {
  batch.audit.push({
    id: uid('AU'),
    date: nowText(),
    owner: '当前用户',
    status: '已记录',
    ...entry,
    era: batch.era,
  })
}

/**
 * 尺寸或方案变化时调用：若该批次已有锁定结论，则结论与旧审计记录失效并重新计算。
 * 旧审计条目不删除（可追溯），仅标记作废；通过待审修订触发时同样走这里。
 */
const invalidateConclusion = (batch: SampleBatch, reason: string) => {
  if (batch.conclusion) {
    batch.conclusion.valid = false
    batch.conclusion.invalidatedAt = nowText()
    batch.conclusion.invalidReason = reason
    batch.audit.forEach((entry) => {
      if (entry.era === batch.era) entry.invalid = true
    })
    batch.era += 1
    const passedCount = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
    pushAudit(batch, {
      title: `锁定结论失效 · ${reason}`,
      detail: `该批次尺寸或方案发生变化，上一版锁定结论（${batch.conclusion.lockedAt}）与当时审计记录已作废，达标率重新计算为 ${passedCount}/${batch.measurements.length}。重新审核锁定后生成新结论。`,
      status: '结论已失效',
    })
  }
}

const recheckFingerprint = (batch: SampleBatch, reason: string) => {
  if (batch.conclusion?.valid) {
    const expected = fingerprintOf(batch.measurements, batch.proposals, batch.decisions)
    if (expected !== batch.conclusion.fingerprint) invalidateConclusion(batch, reason)
  }
}

const addPending = (
  state: DevelopmentState,
  revision: Omit<PendingRevision, 'id' | 'createdAt' | 'author' | 'status'>,
) => {
  state.pendingRevisions.push({
    ...revision,
    id: uid('PD'),
    createdAt: nowText(),
    author: '当前用户',
    status: '待审',
  })
}

const initialState = ((): DevelopmentState => {
  // 1) 已经是 v2（按批次归档）：直接恢复
  const savedV2 = localStorage.getItem(storageKey)
  if (savedV2) {
    try {
      const parsed = JSON.parse(savedV2) as DevelopmentState
      if (parsed?.version === 2 && Array.isArray(parsed.samples)) {
        return { ...parsed, migration: parsed.migration ?? { status: 'idle' } }
      }
    } catch {
      // v2 损坏时继续走种子数据，不影响旧草稿
    }
  }

  // 2) 旧数据（v1，未写批次）：首次打开迁移，按来源补齐批次
  const legacyRaw = localStorage.getItem(legacyKey)
  if (legacyRaw) {
    try {
      const migrated = migrateLegacyState(legacyRaw)
      localStorage.setItem(migrationMetaKey, JSON.stringify({ migratedAt: nowText(), batchesFilled: migrated.batchesFilled }))
      return {
        version: 2,
        samples: migrated.samples,
        selectedId: migrated.selectedId,
        selectedBatch: migrated.roundB,
        roundA: migrated.roundA,
        activeAnnotation: null,
        pendingRevisions: [],
        migration: { status: 'idle' },
      }
    } catch (error) {
      // 迁移失败：保留原草稿（legacyKey 不动），给出重试入口
      return {
        version: 2,
        samples: structuredClone(seedSamples),
        selectedId: seedSamples[0].id,
        selectedBatch: selectEffectiveBatch(seedSamples[0]).id,
        roundA: '第二轮',
        activeAnnotation: null,
        pendingRevisions: [],
        migration: { status: 'failed', error: error instanceof Error ? error.message : '未知迁移错误' },
      }
    }
  }

  // 3) 全新用户：种子数据
  return {
    version: 2,
    samples: structuredClone(seedSamples),
    selectedId: seedSamples[0].id,
    selectedBatch: selectEffectiveBatch(seedSamples[0]).id,
    roundA: '第二轮',
    activeAnnotation: null,
    pendingRevisions: [],
    migration: { status: 'idle' },
  }
})()

const slice = createSlice({
  name: 'development',
  initialState,
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      const sample = getSample(state)
      const effective = selectEffectiveBatch(sample)
      // 切到别的款式时，若当前选中批次该款式还未开始，落到其当前生效批次
      if (sample.batches[state.selectedBatch]?.status === '未开始') state.selectedBatch = effective.id
      state.activeAnnotation = null
    },
    selectBatch(state, action: PayloadAction<RoundId>) {
      state.selectedBatch = action.payload
      state.activeAnnotation = null
    },
    setRounds(state, action: PayloadAction<{ a?: RoundId }>) {
      if (action.payload.a) state.roundA = action.payload.a
    },
    toggleAnnotation(state, action: PayloadAction<string | null>) {
      state.activeAnnotation = action.payload
    },

    /** 新增批注：未锁定直接入该批次；已锁定先进待审修订，不改已确认内容 */
    addAnnotation(state, action: PayloadAction<Omit<Annotation, 'id' | 'author' | 'status'>>) {
      const batch = getBatch(state)
      if (batch.status === '已锁定') {
        addPending(state, {
          batchId: batch.id,
          kind: 'annotation',
          action: '新增',
          summary: `${action.payload.part}：${action.payload.content}`,
          payload: action.payload,
        })
        pushAudit(batch, { title: '新增批注已提交待审', detail: action.payload.content, status: '待审修订' })
        return
      }
      batch.annotations.push({ id: uid('AN'), author: '当前用户', status: '待处理', ...action.payload })
      pushAudit(batch, { title: `${action.payload.part}批注`, detail: action.payload.content, status: '待处理' })
    },

    resolveAnnotation(state, action: PayloadAction<string>) {
      const batch = getBatch(state)
      const annotation = batch.annotations.find((item) => item.id === action.payload)
      if (!annotation || batch.status === '已锁定') return
      annotation.status = annotation.status === '待处理' ? '已解决' : '待处理'
      pushAudit(batch, {
        title: `${annotation.part}批注${annotation.status === '已解决' ? '关闭' : '重开'}`,
        detail: annotation.content,
        status: annotation.status,
      })
    },

    /** 方案决定：未锁定直接生效；已锁定先进待审 */
    decideProposal(state, action: PayloadAction<DecisionDraft>) {
      const batch = getBatch(state)
      if (batch.status === '已锁定') {
        addPending(state, {
          batchId: batch.id,
          kind: 'proposal',
          action: '修正',
          summary: `方案 ${action.payload.proposalId} 改判为「${action.payload.decision}」`,
          payload: action.payload,
        })
        pushAudit(batch, { title: '方案改判已提交待审', detail: action.payload.reason, status: '待审修订' })
        return
      }
      batch.decisions.push(action.payload)
      const proposal = batch.proposals.find((item) => item.id === action.payload.proposalId)
      if (proposal) {
        proposal.status = action.payload.decision
        pushAudit(batch, {
          title: `${proposal.affectedPart}改版方案 ${action.payload.decision}`,
          detail: action.payload.reason,
          status: '已记录',
        })
      }
    },

    /** 新增改版方案：锁定后进待审 */
    addProposal(state, action: PayloadAction<{ author: string; role: string; content: string; affectedPart: string }>) {
      const batch = getBatch(state)
      const proposal: RevisionProposal = {
        id: uid('RV'),
        status: '待决定',
        batchId: batch.id,
        ...action.payload,
      }
      if (batch.status === '已锁定') {
        addPending(state, {
          batchId: batch.id,
          kind: 'proposal',
          action: '新增',
          summary: `${action.payload.affectedPart}：${action.payload.content}`,
          payload: proposal,
        })
        pushAudit(batch, { title: '新改版方案已提交待审', detail: action.payload.content, status: '待审修订' })
        return
      }
      batch.proposals.push(proposal)
      pushAudit(batch, { title: `${action.payload.affectedPart}改版方案提交`, detail: action.payload.content, status: '待决定' })
    },

    /** 修正尺寸实测：未锁定直接改并立即重算判定；锁定后进待审 */
    correctMeasurement(state, action: PayloadAction<{ key: string; actual: number }>) {
      const batch = getBatch(state)
      const measurement = batch.measurements.find((item) => item.key === action.payload.key)
      if (!measurement) return
      if (batch.status === '已锁定') {
        addPending(state, {
          batchId: batch.id,
          kind: 'measurement',
          action: '修正',
          summary: `${measurement.name} 实测 ${measurement.actual.toFixed(1)} → ${action.payload.actual.toFixed(1)} cm`,
          payload: action.payload,
        })
        pushAudit(batch, {
          title: '尺寸修正已提交待审',
          detail: `${measurement.name} 申请由 ${measurement.actual.toFixed(1)} 修正为 ${action.payload.actual.toFixed(1)} cm，通过后锁定结论将失效并重新计算。`,
          status: '待审修订',
        })
        return
      }
      measurement.actual = action.payload.actual
      pushAudit(batch, {
        title: `${measurement.name}尺寸实测修正`,
        detail: `实测值更新为 ${action.payload.actual.toFixed(1)} cm，判定结果已重新计算。`,
        status: '已同步',
      })
    },

    saveBatchNotes(state, action: PayloadAction<string>) {
      const batch = getBatch(state)
      if (batch.status === '已锁定') {
        addPending(state, {
          batchId: batch.id,
          kind: 'proposal',
          action: '修正',
          summary: `补充评审备注：${action.payload.slice(0, 30)}`,
          payload: { notes: action.payload },
        })
        return
      }
      batch.notes = action.payload
    },

    /** 锁定只冻结当前批次；旧批次与其他批次不受影响 */
    lockBatch(state, action: PayloadAction<{ note: string }>) {
      const sample = getSample(state)
      const batch = sample.batches[state.selectedBatch]
      if (!batch || batch.status === '已锁定') return
      const pendingAnnotations = batch.annotations.filter((item) => item.status === '待处理').length
      const pendingProposals = batch.proposals.filter((item) => item.status === '待决定').length
      if (pendingAnnotations > 0 || pendingProposals > 0) return

      batch.status = '已锁定'
      batch.proposals.forEach((proposal) => {
        if (proposal.status === '待决定') proposal.status = '未采纳'
      })
      batch.era += 1
      const passedCount = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
      batch.conclusion = {
        lockedAt: nowText(),
        lockedBy: '当前用户',
        note: action.payload.note,
        fingerprint: fingerprintOf(batch.measurements, batch.proposals, batch.decisions),
        era: batch.era,
        valid: true,
        passedCount,
        totalCount: batch.measurements.length,
      }
      batch.audit.forEach((entry) => {
        if (entry.era < batch.era) entry.invalid = true
      })
      pushAudit(batch, {
        title: `${batch.id}审核锁定`,
        detail: `${action.payload.note}｜达标部位 ${passedCount}/${batch.measurements.length}，尺寸、批注与方案冻结为只读快照。`,
        status: '已锁定',
      })
    },

    unlockBatch(state) {
      const batch = getBatch(state)
      if (batch.conclusion) {
        invalidateConclusion(batch, '负责人解锁修订')
      }
      batch.status = '待审核'
    },

    /** 通过待审修订：写入该批次；若批次已锁定，其锁定结论与审计记录失效并重新计算 */
    approveRevision(state, action: PayloadAction<string>) {
      const sample = getSample(state)
      const revision = state.pendingRevisions.find((item) => item.id === action.payload)
      if (!revision || revision.status !== '待审') return
      const batch = sample.batches[revision.batchId]
      if (!batch) return
      const wasLocked = batch.status === '已锁定'

      if (revision.kind === 'measurement') {
        const payload = revision.payload as { key: string; actual: number }
        const measurement = batch.measurements.find((item) => item.key === payload.key)
        if (measurement) measurement.actual = payload.actual
      } else if (revision.kind === 'annotation') {
        const payload = revision.payload as Omit<Annotation, 'id' | 'author' | 'status'>
        batch.annotations.push({ id: uid('AN'), author: revision.author, status: '待处理', ...payload })
      } else if (revision.action === '新增') {
        const payload = revision.payload as RevisionProposal
        batch.proposals.push({ ...payload, id: uid('RV'), status: '待决定' })
      } else if ((revision.payload as { notes?: string })?.notes !== undefined) {
        batch.notes = (revision.payload as { notes: string }).notes
      } else {
        const payload = revision.payload as DecisionDraft
        batch.decisions.push(payload)
        const proposal = batch.proposals.find((item) => item.id === payload.proposalId)
        if (proposal) proposal.status = payload.decision
      }

      revision.status = '已通过'
      pushAudit(batch, {
        title: `待审修订通过 · ${revision.summary}`,
        detail: wasLocked ? '修订写入已锁定批次，原锁定结论失效，达标率与审计记录重新计算，需重新审核锁定。' : '修订已写入该批次。',
        status: '修订已通过',
      })
      // 尺寸或方案变化（批注不影响尺寸结论，也不使锁定结论失效）
      if (wasLocked && revision.kind !== 'annotation') {
        invalidateConclusion(batch, `待审修订通过（${revision.kind === 'measurement' ? '尺寸变化' : '方案变化'}）`)
      }
    },

    rejectRevision(state, action: PayloadAction<string>) {
      const revision = state.pendingRevisions.find((item) => item.id === action.payload)
      if (revision && revision.status === '待审') revision.status = '已驳回'
    },

    /** 迁移失败后的重试入口：重新读取原草稿并迁移 */
    retryMigration(state) {
      const legacyRaw = localStorage.getItem(legacyKey)
      if (!legacyRaw) {
        state.migration = { status: 'idle' }
        return
      }
      try {
        const migrated = migrateLegacyState(legacyRaw)
        state.samples = migrated.samples
        state.selectedId = migrated.selectedId
        state.selectedBatch = migrated.roundB
        state.roundA = migrated.roundA
        state.pendingRevisions = []
        state.activeAnnotation = null
        state.migration = { status: 'idle' }
        localStorage.setItem(migrationMetaKey, JSON.stringify({ migratedAt: nowText(), batchesFilled: migrated.batchesFilled, retried: true }))
      } catch (error) {
        state.migration = { status: 'failed', error: error instanceof Error ? error.message : '未知迁移错误' }
      }
    },

    /** 指纹兜底校验（外部数据写回时使用） */
    verifyBatchConclusions(state) {
      for (const sample of state.samples) {
        for (const round of ROUND_IDS) {
          recheckFingerprint(sample.batches[round], '检测到批次数据变化')
        }
      }
    },
  },
})

export const {
  selectSample,
  selectBatch,
  setRounds,
  toggleAnnotation,
  addAnnotation,
  resolveAnnotation,
  decideProposal,
  addProposal,
  correctMeasurement,
  saveBatchNotes,
  lockBatch,
  unlockBatch,
  approveRevision,
  rejectRevision,
  retryMigration,
} = slice.actions
export const developmentReducer = slice.reducer

export const selectors = {
  currentSample: getSample,
  currentBatch: getBatch,
  effectiveBatch: (state: DevelopmentState) => selectEffectiveBatch(getSample(state)),
}
