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
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { lockBatch, unlockBatch } from '../features/developmentSlice'
import type { Sample, SamplingBatch } from '../api/types'

function effectiveBatch(sample: Sample): SamplingBatch {
  return sample.batches.find((batch) => batch.id === sample.effectiveBatchId) ?? sample.batches[sample.batches.length - 1]
}

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lockNote, setLockNote] = useState('')

  const viewingBatch = sample.batches.find((batch) => batch.id === viewingId) ?? effectiveBatch(sample)
  const pendingAnnotations = viewingBatch.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = viewingBatch.proposals.filter((item) => item.status === '待决定').length
  const canLock = pendingAnnotations === 0 && pendingProposals === 0 && !viewingBatch.locked

  const events = viewingBatch.audit

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 审核与锁定</Typography>
          <Typography color="text.secondary">按打样批次单独归档；旧批次的锁定结论与审计记录可单独查回。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出修订记录</Button>
          {viewingBatch.locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockBatch({ sampleId: sample.id, batchId: viewingBatch.id }))}>
              解锁{viewingBatch.name}
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<LockOutlineIcon />}
              onClick={() => { setLockNote(''); setConfirmOpen(true) }}
              disabled={!canLock}
            >
              锁定{viewingBatch.name}
            </Button>
          )}
        </Stack>
      </Box>

      {!canLock && !viewingBatch.locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          审核前需处理 {pendingAnnotations} 项待处理批注和 {pendingProposals} 项待决定改版方案。
        </Alert>
      )}
      {viewingBatch.locked && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          {viewingBatch.name}已锁定，本轮尺寸、批注与方案为只读；新增内容进入待审修订，不改动已确认结论。
        </Alert>
      )}

      <Box className="panel" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {sample.batches.map((batch) => {
            const active = batch.id === viewingBatch.id
            const isEffective = batch.id === sample.effectiveBatchId
            return (
              <Chip
                key={batch.id}
                label={`${batch.name} · ${batch.round}${isEffective ? ' · 生效' : ''}`}
                onClick={() => setViewingId(batch.id)}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                icon={batch.locked ? <LockOutlineIcon /> : undefined}
              />
            )
          })}
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 310px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>{viewingBatch.name} · 完整审计时间线</Typography>
          </Stack>
          {events.length === 0 ? (
            <Typography color="text.secondary" fontSize={13}>本批次暂无审计记录，锁定后将生成不可覆盖的审核快照。</Typography>
          ) : (
            <Box>
              {events.map((event, index) => (
                <Box key={`${event.title}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '92px 24px 1fr', gap: 1 }}>
                  <Typography color="text.secondary" fontSize={11} pt={0.6}>{event.date}</Typography>
                  <Box sx={{ position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: event.status === '已失效' ? '#b44b2d' : '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 1px #25756d' } }} />
                  <Box sx={{ pb: 2.2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography fontWeight={800} fontSize={13}>{event.title}</Typography>
                      <Chip size="small" label={event.status} color={event.status === '已锁定' ? 'success' : event.status === '已失效' ? 'error' : 'default'} />
                    </Stack>
                    <Typography color="text.secondary" fontSize={12} mt={0.5}>{event.detail}</Typography>
                    <Typography color="#8a918d" fontSize={10} mt={0.5}>操作者：{event.owner}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box className="panel" sx={{ alignSelf: 'start' }}>
          <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
            <Typography fontWeight={800}>{viewingBatch.name} · 锁定结论</Typography>
          </Box>
          <Stack spacing={1.5} p={1.6}>
            {viewingBatch.conclusion ? (
              <>
                <Box sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1, bgcolor: '#edf5f2' }}>
                  <Typography color="text.secondary" fontSize={11}>尺寸达标率</Typography>
                  <Typography fontWeight={850} fontSize={26} color="#2d7665">{viewingBatch.conclusion.passRate}%</Typography>
                  <Typography color="text.secondary" fontSize={11}>{viewingBatch.conclusion.passedCount}/{viewingBatch.conclusion.totalCount} 项达标</Typography>
                </Box>
                <Box sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1 }}>
                  <Typography color="text.secondary" fontSize={11}>锁定时间</Typography>
                  <Typography fontWeight={700} fontSize={13} mt={0.3}>{viewingBatch.conclusion.decidedAt}</Typography>
                </Box>
                <Box sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1 }}>
                  <Typography color="text.secondary" fontSize={11}>锁定说明</Typography>
                  <Typography fontSize={12} mt={0.3}>{viewingBatch.conclusion.note}</Typography>
                </Box>
                <Box sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1 }}>
                  <Typography color="text.secondary" fontSize={11}>决定汇总</Typography>
                  <Typography fontSize={12} mt={0.3}>{viewingBatch.conclusion.decisionSummary}</Typography>
                </Box>
              </>
            ) : (
              <Typography color="text.secondary" fontSize={12}>
                {viewingBatch.locked ? '本批次锁定结论已失效，需重新评审锁定。' : '本批次尚未锁定，锁定后将在此固化尺寸达标率与审核结论。'}
              </Typography>
            )}
            <Box sx={{ p: 1.3, border: '1px solid #e4e1dc', borderRadius: 1 }}>
              <Typography color="text.secondary" fontSize={11}>批次状态</Typography>
              <Stack direction="row" spacing={0.6} mt={0.5} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={viewingBatch.status} color={viewingBatch.locked ? 'success' : 'default'} />
                <Chip size="small" variant="outlined" label={`批注 ${viewingBatch.annotations.filter((a) => a.status === '已解决').length}/${viewingBatch.annotations.length}`} />
                <Chip size="small" variant="outlined" label={`待审修订 ${viewingBatch.pendingRevisions.filter((r) => r.status === '待审').length}`} />
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认锁定 {viewingBatch.name}（{viewingBatch.round}）</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>
            仅冻结当前批次。锁定后本批尺寸、批注和采纳方案变为只读并生成审核快照；
            之后新增或修正进入待审修订，不改动已确认内容。
          </Typography>
          <TextField fullWidth label="锁定说明" value={lockNote} onChange={(event) => setLockNote(event.target.value)} placeholder={`确认 ${viewingBatch.round} 版型与工艺资料完整，可进入下一阶段。`} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              dispatch(lockBatch({ sampleId: sample.id, batchId: viewingBatch.id, note: lockNote || `确认 ${viewingBatch.round} 版型与工艺资料完整。` }))
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
