import { migrateSamples } from './migration'
import { seedSamples } from '../api/seed'
import type { OldSample, Sample } from '../api/types'

export const DRAFT_V1_KEY = 'garment-sampling-draft-v1'
export const DRAFT_V2_KEY = 'garment-sampling-draft-v2'

export type LoadResult =
  | { ok: true; samples: Sample[] }
  | { ok: false; error: string; legacyDraft: OldSample[] | null }

function now() {
  return new Date().toLocaleString('zh-CN')
}

/**
 * 首次打开 / 刷新时载入草稿。
 * - 优先读取已迁移的 v2 草稿；
 * - 否则读取旧版 v1 草稿并按来源补齐批次；
 * - 都没有则用内置旧数据走首次迁移。
 * 迁移失败时保留原草稿（legacyDraft），由调用方给出重试入口。
 */
export function loadDraft(): LoadResult {
  try {
    const v2 = localStorage.getItem(DRAFT_V2_KEY)
    if (v2) {
      const parsed = JSON.parse(v2) as { samples?: Sample[] }
      if (parsed && Array.isArray(parsed.samples) && parsed.samples.every((s) => Array.isArray(s.batches))) {
        return { ok: true, samples: parsed.samples }
      }
      // v2 结构损坏，尝试作为旧数据重新迁移
      const legacy = (parsed as { samples?: OldSample[] }).samples
      return attemptMigration(legacy ?? null)
    }

    const v1 = localStorage.getItem(DRAFT_V1_KEY)
    if (v1) {
      const parsed = JSON.parse(v1) as { samples?: OldSample[] }
      return attemptMigration(parsed?.samples ?? null)
    }

    // 首次打开：内置旧数据迁移
    return attemptMigration(seedSamples)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '草稿读取失败',
      legacyDraft: null,
    }
  }
}

/**
 * 从保留的原草稿重试迁移。
 */
export function retryMigration(legacyDraft: OldSample[] | null): LoadResult {
  return attemptMigration(legacyDraft ?? seedSamples)
}

function attemptMigration(legacy: OldSample[] | null): LoadResult {
  try {
    if (!legacy) {
      return { ok: false, error: '没有可用于迁移的原草稿', legacyDraft: null }
    }
    const samples = migrateSamples(legacy, now())
    return { ok: true, samples }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '迁移失败',
      legacyDraft: legacy,
    }
  }
}

export function saveDraft(samples: Sample[]) {
  try {
    localStorage.setItem(DRAFT_V2_KEY, JSON.stringify({ draftVersion: 2, samples }))
  } catch {
    // 持久化失败不阻断操作
  }
}
