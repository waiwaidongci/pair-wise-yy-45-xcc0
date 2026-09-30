import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { approveRevision, lockBatch, rejectRevision, selectBatch, unlockBatch } from '../features/developmentSlice'
import BatchTabs from '../features/BatchTabs'
import { selectEffectiveBatch } from '../api/seed'
import { ROUND_IDS } from '../api/types'

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const batch = sample.batches[state.selectedBatch] ?? selectEffectiveBatch(sample)
  const effective = selectEffectiveBatch(sample)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lockNote, setLockNote] = useState('')

  const locked = batch.status === '已锁定'
  const stale = Boolean(batch.conclusion && !batch.conclusion.valid)
  const pendingAnnotations = batch.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = batch.proposals.filter((item) => item.status === '待决定').length
  const pendingRevisions = state.pendingRevisions.filter((item) => item.batchId === batch.id && item.status === '待审')
  const canLock = !locked && pendingAnnotations === 0 && pendingProposals === 0 && pendingRevisions.length === 0
  const passed = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length

  const events = [...batch.audit].reverse()
  const currentEraEvents = events.filter((event) => event.era === batch.era && !event.invalid)
  const invalidEvents = events.filter((event) => event.invalid || event.era < batch.era)

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 批次审核与锁定</Typography>
          <Typography color="text.secondary">每个打样批次独立归档、独立锁定；批次尺寸或方案变化后，该批结论与审计记录失效并重新计算。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出批次记录</Button>
          {locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockBatch())}>
              解锁{batch.id}修订
            </Button>
          ) : (
            <Button variant="contained" startIcon={<LockOutlineIcon />} onClick={() => setConfirmOpen(true)} disabled={!canLock}>
              锁定{batch.id}
            </Button>
          )}
        </Stack>
      </Box>

      <Box className="panel" sx={{ p: 1.4, mb: 1.5 }}>
        <BatchTabs sample={sample} selected={batch.id} onSelect={(round) => dispatch(selectBatch(round))} />
        <Typography fontSize={11} color="text.secondary" mt={1}>
          旧批次的有效结论可在此单独切换查回；总览与历史统计只采用当前生效批次「{effective.id}」。
        </Typography>
      </Box>

      {!canLock && !locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          锁定前需处理 {pendingAnnotations} 项待处理批注、{pendingProposals} 项待决定方案和 {pendingRevisions.length} 条待审修订。
        </Alert>
      )}
      {locked && !stale && (
        <Alert
          severity="success"
          sx={{ mb: 1.5 }}
          action={<Chip size="small" label={`达标 ${batch.conclusion?.passedCount}/${batch.conclusion?.totalCount}`} />}
        >
          {batch.id}锁定结论生效中（{batch.conclusion?.lockedAt}）：{batch.conclusion?.note}
        </Alert>
      )}
      {stale && (
        <Alert severity="error" sx={{ mb: 1.5 }} icon={<WarningAmberRoundedIcon />}>
          {batch.id}锁定结论已失效：{batch.conclusion?.invalidReason}（{batch.conclusion?.invalidatedAt}）。当前达标率已重算为 {passed}/{batch.measurements.length}，处理完待办后重新锁定以生成新结论。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>{batch.id} · 审计时间线</Typography>
          </Stack>
          <Box>
            {currentEraEvents.map((event) => (
              <Box key={event.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '120px 24px 1fr', sm: '150px 24px 1fr' }, gap: 1 }}>
                <Typography color="text.secondary" fontSize={11} pt={0.6}>{event.date}</Typography>
                <Box sx={{ position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 1px #25756d' } }} />
                <Box sx={{ pb: 2.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={800} fontSize={13}>{event.title}</Typography>
                    <Chip size="small" label={event.status} color={event.status === '结论已失效' ? 'error' : event.status === '待审修订' ? 'secondary' : 'default'} />
                  </Stack>
                  <Typography color="text.secondary" fontSize={12} mt={0.5}>{event.detail}</Typography>
                  <Typography color="#8a918d" fontSize={10} mt={0.5}>操作者：{event.owner}</Typography>
                </Box>
              </Box>
            ))}
            {currentEraEvents.length === 0 && (
              <Typography color="text.secondary" fontSize={12}>该批次暂无生效中的审计记录。</Typography>
            )}
          </Box>

          {invalidEvents.length > 0 && (
            <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed #d8d3cb' }}>
              <Stack direction="row" spacing={0.8} alignItems="center" mb={1}>
                <ArchiveOutlinedIcon fontSize="small" color="disabled" />
                <Typography fontWeight={800} fontSize={12} color="text.secondary">
                  已作废的历史审计（{invalidEvents.length}）· 尺寸/方案变化后自动失效，保留可追溯
                </Typography>
              </Stack>
              {invalidEvents.map((event) => (
                <Box key={event.id} sx={{ opacity: 0.62, display: 'grid', gridTemplateColumns: { xs: '120px 1fr', sm: '150px 1fr' }, gap: 1, pb: 1.2 }}>
                  <Typography color="text.secondary" fontSize={11}>{event.date}</Typography>
                  <Box>
                    <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                      <Typography fontWeight={700} fontSize={12} sx={{ textDecoration: 'line-through' }}>{event.title}</Typography>
                      <Chip size="small" label="已作废" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    </Stack>
                    <Typography color="text.secondary" fontSize={11}>{event.detail}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box>
          <Box className="panel" sx={{ mb: 1.5 }}>
            <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
              <Typography fontWeight={800}>批次结论摘要</Typography>
            </Box>
            <Stack spacing={1.2} p={1.6}>
              <Box sx={{ p: 1.3, border: stale ? '1px solid #e2b3a2' : '1px solid #d7e5df', borderRadius: 1, bgcolor: stale ? '#fdf3ee' : '#f2f8f5' }}>
                <Typography fontWeight={800} fontSize={13}>{batch.id}</Typography>
                <Typography fontSize={11} color="text.secondary" mt={0.6}>
                  状态：{stale ? '已锁定 · 结论失效，待重新锁定' : batch.status}
                </Typography>
                <Typography fontSize={11} color="text.secondary" mt={0.3}>
                  实时达标：{passed}/{batch.measurements.length} 项
                  {batch.conclusion && ` ｜锁定时：${batch.conclusion.passedCount}/${batch.conclusion.totalCount} 项`}
                </Typography>
                {batch.conclusion && (
                  <Typography fontSize={11} mt={0.6} color={stale ? '#b44b2d' : '#2d7665'}>
                    {stale ? '指纹不一致，结论已作废' : `锁定于 ${batch.conclusion.lockedAt} · ${batch.conclusion.lockedBy}`}
                  </Typography>
                )}
              </Box>
              {ROUND_IDS.filter((round) => round !== batch.id).map((round) => {
                const other = sample.batches[round]
                const otherStale = Boolean(other.conclusion && !other.conclusion.valid)
                return (
                  <Box
                    key={round}
                    sx={{ p: 1.1, border: '1px solid #e4e1dc', borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#f7f6f3' } }}
                    onClick={() => dispatch(selectBatch(round))}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography fontWeight={700} fontSize={12}>
                        {round}{round === effective.id ? ' · 当前生效' : ''}
                      </Typography>
                      <Chip size="small" label={otherStale ? '结论失效' : other.status} color={otherStale ? 'error' : other.status === '已锁定' ? 'success' : 'default'} sx={{ height: 18, fontSize: 10 }} />
                    </Stack>
                    <Typography fontSize={10} color="text.secondary" mt={0.4}>
                      {other.status === '已锁定' && other.conclusion
                        ? `${other.conclusion.valid ? '有效结论' : '结论失效'} · 达标 ${other.conclusion.passedCount}/${other.conclusion.totalCount} · 锁定 ${other.conclusion.lockedAt}`
                        : `${other.measurements.length} 项实测 · ${other.annotations.length} 批注 · ${other.proposals.length} 方案`}
                    </Typography>
                  </Box>
                )
              })}
            </Stack>
          </Box>

          <Box className="panel">
            <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <FactCheckOutlinedIcon color="secondary" fontSize="small" />
                <Typography fontWeight={800}>待审修订（{pendingRevisions.length}）</Typography>
              </Stack>
            </Box>
            <Stack spacing={1.2} p={1.6}>
              {pendingRevisions.length === 0 && <Typography fontSize={12} color="text.secondary">暂无待审修订。</Typography>}
              {pendingRevisions.map((revision) => (
                <Box key={revision.id} sx={{ p: 1.2, border: '1px dashed #d3b48f', borderRadius: 1 }}>
                  <Chip size="small" label={`${revision.action}${revision.kind === 'measurement' ? '尺寸' : revision.kind === 'annotation' ? '批注' : '方案'}`} color="secondary" sx={{ mb: 0.6 }} />
                  <Typography fontSize={12} fontWeight={700}>{revision.summary}</Typography>
                  <Typography fontSize={10} color="text.secondary" mt={0.3}>
                    {revision.author} · {revision.createdAt}
                    {locked && revision.kind !== 'annotation' && ' · 通过后该批锁定结论立即失效并重算'}
                  </Typography>
                  <Stack direction="row" spacing={1} mt={0.8}>
                    <Button size="small" color="inherit" onClick={() => dispatch(rejectRevision(revision.id))}>驳回</Button>
                    <Button size="small" variant="contained" onClick={() => dispatch(approveRevision(revision.id))}>通过</Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认锁定 {batch.id}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>
            锁定仅冻结当前批次「{batch.id}」，其他批次与旧批次不受影响。锁定后该批尺寸、批注和方案变为只读快照；之后新增或修正先进入待审修订。
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="锁定说明"
            defaultValue={lockNote || `确认 ${batch.id} 版型与工艺资料完整，可进入下一阶段。`}
            onChange={(event) => setLockNote(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              dispatch(lockBatch({ note: lockNote || `确认 ${batch.id} 版型与工艺资料完整，可进入下一阶段。` }))
              setConfirmOpen(false)
            }}
          >
            确认锁定
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
