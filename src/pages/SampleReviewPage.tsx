import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PhotoCameraBackOutlinedIcon from '@mui/icons-material/PhotoCameraBackOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined'
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  addAnnotation,
  addProposal,
  approveRevision,
  correctMeasurement,
  decideProposal,
  rejectRevision,
  resolveAnnotation,
  saveBatchNotes,
  selectBatch,
  setRounds,
  toggleAnnotation,
} from '../features/developmentSlice'
import BatchTabs from '../features/BatchTabs'
import { selectEffectiveBatch } from '../api/seed'
import type { RoundId } from '../api/types'
import { ROUND_IDS } from '../api/types'

export default function SampleReviewPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const batch = sample.batches[state.selectedBatch] ?? selectEffectiveBatch(sample)
  const locked = batch.status === '已锁定'
  const stale = Boolean(batch.conclusion && !batch.conclusion.valid)
  const pendingForBatch = state.pendingRevisions.filter((item) => item.batchId === batch.id && item.status === '待审')

  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [proposalOpen, setProposalOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [annotationDraft, setAnnotationDraft] = useState({ x: 50, y: 42, part: '版型', content: '' })
  const [proposalDraft, setProposalDraft] = useState({ affectedPart: '肩袖', content: '', role: '版师' })
  const imageRef = useRef<HTMLDivElement>(null)

  const measurementsA = sample.batches[state.roundA].measurements
  const measurementsB = batch.measurements

  const comparison = useMemo(() => {
    return measurementsA.map((item, index) => {
      const current = measurementsB[index]
      return {
        key: item.key,
        name: item.name,
        spec: current.spec,
        tolerance: current.tolerance,
        previous: item.actual,
        current: current.actual,
        delta: current.actual - item.actual,
        inTolerance: Math.abs(current.actual - current.spec) <= current.tolerance,
      }
    })
  }, [measurementsA, measurementsB])

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnnotationDraft((current) => ({
      ...current,
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    }))
    setAnnotationOpen(true)
  }

  const submitDecision = (decision: '已采纳' | '未采纳') => {
    if (!decisionDialog || !decisionReason.trim()) return
    dispatch(decideProposal({ proposalId: decisionDialog, decision, reason: decisionReason, decidedAt: new Date().toLocaleString('zh-CN') }))
    setDecisionDialog(null)
    setDecisionReason('')
  }

  const submitMeasurement = () => {
    const value = Number(editValue)
    if (editingKey && Number.isFinite(value)) {
      dispatch(correctMeasurement({ key: editingKey, actual: value }))
    }
    setEditingKey(null)
  }

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">SAMPLE REVIEW / 样品评审</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 批次对比</Typography>
          <Typography color="text.secondary">尺寸实测、批注、改版方案按打样批次分开归档；锁定只冻结当前批次。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PhotoCameraBackOutlinedIcon />}>上传样衣照片</Button>
          <Button
            variant="contained"
            startIcon={<PostAddOutlinedIcon />}
            disabled={locked}
            onClick={() => setProposalOpen(true)}
          >
            提交改版方案
          </Button>
        </Stack>
      </Box>

      <Box className="panel" sx={{ p: 1.4, mb: 1.5 }}>
        <BatchTabs sample={sample} selected={batch.id} onSelect={(round) => dispatch(selectBatch(round))} />
      </Box>

      {locked && !stale && (
        <Alert severity="success" sx={{ mb: 1.5 }} action={<Chip size="small" label={`锁定于 ${batch.conclusion?.lockedAt}`} />}>
          {batch.id}已审核锁定，尺寸、批注与方案为只读快照。新增或修正会先进入待审修订，不会改动已确认内容。
        </Alert>
      )}
      {stale && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {batch.id}的锁定结论已失效（{batch.conclusion?.invalidReason}）。下方判定已按最新尺寸/方案重新计算，请在修订历史页重新审核锁定。
        </Alert>
      )}
      {!locked && batch.annotations.some((item) => item.status === '待处理') && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {batch.id}仍有 {batch.annotations.filter((item) => item.status === '待处理').length} 项待处理批注，审核锁定前必须逐项关闭。
        </Alert>
      )}
      {pendingForBatch.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }} icon={<PendingActionsOutlinedIcon />}>
          {batch.id}有 {pendingForBatch.length} 条待审修订，通过后才会写入本批次；涉及尺寸/方案的修订通过后会使旧锁定结论失效。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.15fr) minmax(340px,.85fr)' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontWeight={800}>尺寸实测差异 · 归档于 {batch.id}</Typography>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>基准批次</InputLabel>
                <Select label="基准批次" value={state.roundA} onChange={(event) => dispatch(setRounds({ a: event.target.value as RoundId }))}>
                  {ROUND_IDS.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>对比批次</InputLabel>
                <Select
                  label="对比批次"
                  value={batch.id}
                  onChange={(event) => dispatch(selectBatch(event.target.value as RoundId))}
                >
                  {ROUND_IDS.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 660 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                  <TableCell>部位</TableCell>
                  <TableCell>规格</TableCell>
                  <TableCell>±容差</TableCell>
                  <TableCell>{state.roundA}</TableCell>
                  <TableCell>{batch.id}实测</TableCell>
                  <TableCell>变化</TableCell>
                  <TableCell>判定</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.map((item) => (
                  <TableRow key={item.key} sx={{ bgcolor: item.inTolerance ? 'transparent' : '#fff4ef' }}>
                    <TableCell sx={{ fontWeight: 750 }}>{item.name}</TableCell>
                    <TableCell>{item.spec} cm</TableCell>
                    <TableCell>±{item.tolerance}</TableCell>
                    <TableCell>{item.previous.toFixed(1)}</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: item.inTolerance ? '#2d7665' : '#b44b2d' }}>
                      {editingKey === item.key ? (
                        <TextField
                          autoFocus
                          size="small"
                          defaultValue={item.current}
                          sx={{ width: 90 }}
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={submitMeasurement}
                          onKeyDown={(event) => event.key === 'Enter' && submitMeasurement()}
                          InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                        />
                      ) : (
                        item.current.toFixed(1)
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`} color={Math.abs(item.delta) > 0.5 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={item.inTolerance ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />} label={item.inTolerance ? '达标' : '超差'} color={item.inTolerance ? 'success' : 'error'} />
                    </TableCell>
                    <TableCell>
                      {!locked && editingKey !== item.key && (
                        <Tooltip title="修正实测值（立即重新计算判定）">
                          <IconButton size="small" onClick={() => { setEditingKey(item.key); setEditValue(String(item.current)) }}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {locked && (
            <Typography fontSize={11} color="text.secondary" sx={{ px: 2, pt: 1 }}>
              当前批次已锁定：尺寸修正请在下方「待审修订」流程提交，通过后锁定结论失效并重算。
            </Typography>
          )}
          <Box sx={{ p: 1.5, borderTop: '1px solid #ece9e4' }}>
            <TextField
              key={batch.id}
              multiline
              minRows={2}
              fullWidth
              size="small"
              label={`${batch.id}评审草稿`}
              defaultValue={batch.notes}
              disabled={locked}
              onBlur={(event) => dispatch(saveBatchNotes(event.target.value))}
              helperText={locked ? '已锁定批次的备注修改将作为待审修订提交' : undefined}
            />
          </Box>
        </Box>

        <Box className="panel">
          <Box sx={{ px: 1.8, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between' }}>
            <Typography fontWeight={800}>样衣部位批注 · {batch.id}（{batch.annotations.length}）</Typography>
            <Button size="small" startIcon={<AddLocationAltOutlinedIcon />} disabled={locked} onClick={() => setAnnotationOpen(true)}>添加批注</Button>
          </Box>
          <Box
            ref={imageRef}
            onClick={handleImageClick}
            sx={{
              position: 'relative',
              height: 380,
              m: 1.5,
              overflow: 'hidden',
              cursor: locked ? 'default' : 'crosshair',
              borderRadius: 1.5,
              background: 'linear-gradient(180deg,#dfe5e4 0%,#cbd4d1 100%)',
              backgroundImage: 'linear-gradient(180deg,#dce4e2 0%,#c7d2cf 100%), repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.18) 40px)',
            }}
          >
            <Box sx={{ position: 'absolute', left: '50%', top: 32, transform: 'translateX(-50%)', width: 170, height: 55, border: '3px solid #526a65', borderRadius: '50% 50% 22% 22%', bgcolor: '#657d77' }} />
            <Box sx={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', width: 210, height: 210, border: '3px solid #526a65', borderRadius: '38px 38px 22px 22px', bgcolor: '#718983' }}>
              <Box sx={{ position: 'absolute', left: 50, top: 60, width: 110, height: 76, border: '1px dashed rgba(255,255,255,.6)', borderRadius: 2 }} />
              <Box sx={{ position: 'absolute', left: 35, top: 30, right: 35, borderTop: '2px solid rgba(255,255,255,.45)' }} />
              <Box sx={{ position: 'absolute', left: 38, top: 138, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
              <Box sx={{ position: 'absolute', right: 38, top: 138, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
            </Box>
            <Box sx={{ position: 'absolute', left: 50, top: 96, width: 52, height: 190, border: '3px solid #526a65', borderRadius: '25px 8px 12px 25px', bgcolor: '#657d77', transform: 'rotate(7deg)' }} />
            <Box sx={{ position: 'absolute', right: 50, top: 96, width: 52, height: 190, border: '3px solid #526a65', borderRadius: '8px 25px 25px 12px', bgcolor: '#657d77', transform: 'rotate(-7deg)' }} />
            {batch.annotations.map((annotation) => (
              <Tooltip key={annotation.id} title={`${annotation.part}：${annotation.content}`}>
                <Box
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!locked) dispatch(toggleAnnotation(state.activeAnnotation === annotation.id ? null : annotation.id))
                  }}
                  sx={{
                    position: 'absolute',
                    left: `${annotation.x}%`,
                    top: `${annotation.y}%`,
                    width: 24,
                    height: 24,
                    display: 'grid',
                    placeItems: 'center',
                    transform: 'translate(-50%,-50%)',
                    borderRadius: '50%',
                    color: '#fff',
                    bgcolor: annotation.status === '待处理' ? '#cf6236' : '#397c69',
                    border: '3px solid rgba(255,255,255,.9)',
                    boxShadow: '0 3px 10px rgba(0,0,0,.25)',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  {annotation.id.slice(-2)}
                </Box>
              </Tooltip>
            ))}
            <Chip label={locked ? '只读：已锁定批次' : '点击样衣任意部位添加批注'} size="small" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: 'rgba(255,255,255,.9)' }} />
          </Box>
          <Stack spacing={1} sx={{ px: 1.5, pb: 1.5, maxHeight: 220, overflowY: 'auto' }}>
            {batch.annotations.length === 0 && <Typography fontSize={12} color="text.secondary" sx={{ p: 1 }}>该批次暂无批注（其他批次的批注不会混入）。</Typography>}
            {batch.annotations.map((annotation) => (
              <Box key={annotation.id} sx={{ p: 1.2, borderLeft: `3px solid ${annotation.status === '待处理' ? '#cf6236' : '#397c69'}`, bgcolor: '#f8f7f4', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={800} fontSize={12}>{annotation.part} · {annotation.author}</Typography>
                  {!locked && (
                    <Button size="small" onClick={() => dispatch(resolveAnnotation(annotation.id))}>
                      {annotation.status === '待处理' ? '关闭' : '重开'}
                    </Button>
                  )}
                </Stack>
                <Typography color="text.secondary" fontSize={11} mt={0.4}>{annotation.content}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={800}>替代修改方案与采纳决定 · {batch.id}（{batch.proposals.length}）</Typography>
          <Button size="small" startIcon={<PostAddOutlinedIcon />} disabled={locked} onClick={() => setProposalOpen(true)}>新增方案</Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5, p: 1.5 }}>
          {batch.proposals.length === 0 && <Typography fontSize={12} color="text.secondary">该批次暂无改版方案。</Typography>}
          {batch.proposals.map((proposal) => (
            <Box key={proposal.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={800}>{proposal.affectedPart} · {proposal.role}</Typography>
                <Chip size="small" label={proposal.status} color={proposal.status === '已采纳' ? 'success' : proposal.status === '未采纳' ? 'default' : 'warning'} />
              </Stack>
              <Typography fontSize={13} mt={1}>{proposal.content}</Typography>
              <Typography color="text.secondary" fontSize={11} mt={0.7}>提交人：{proposal.author}</Typography>
              {proposal.status === '待决定' && (
                <Button size="small" variant="outlined" sx={{ mt: 1.2 }} onClick={() => setDecisionDialog(proposal.id)} disabled={locked}>
                  作出决定
                </Button>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {pendingForBatch.length > 0 && (
        <Box className="panel" sx={{ mt: 1.5, borderColor: '#c8a27a' }}>
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4' }}>
            <Typography fontWeight={800}>待审修订 · {batch.id}</Typography>
            <Typography fontSize={12} color="text.secondary">锁定批次的新增/修正先停留在这里；通过后写入，尺寸或方案类修订会使锁定结论失效并重新计算。</Typography>
          </Box>
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {pendingForBatch.map((revision) => (
              <Box key={revision.id} sx={{ p: 1.3, border: '1px dashed #d3b48f', borderRadius: 1.2, display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Box>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <Chip size="small" label={`${revision.action}${revision.kind === 'measurement' ? '尺寸' : revision.kind === 'annotation' ? '批注' : '方案'}`} color="secondary" />
                    <Typography fontSize={13} fontWeight={700}>{revision.summary}</Typography>
                  </Stack>
                  <Typography fontSize={11} color="text.secondary" mt={0.5}>{revision.author} · {revision.createdAt}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" color="inherit" onClick={() => dispatch(rejectRevision(revision.id))}>驳回</Button>
                  <Button size="small" variant="contained" onClick={() => dispatch(approveRevision(revision.id))}>通过并写入</Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Dialog open={annotationOpen} onClose={() => setAnnotationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>添加部位批注 · 归属{batch.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="详细部位" value={annotationDraft.part} onChange={(event) => setAnnotationDraft({ ...annotationDraft, part: event.target.value })} />
            <TextField multiline minRows={3} label="批注内容" value={annotationDraft.content} onChange={(event) => setAnnotationDraft({ ...annotationDraft, content: event.target.value })} />
            <Typography color="text.secondary" fontSize={12}>批注锚点：{annotationDraft.x}% / {annotationDraft.y}% · 归档批次 {batch.id}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnotationOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!annotationDraft.part.trim() || !annotationDraft.content.trim()}
            onClick={() => {
              dispatch(addAnnotation({ ...annotationDraft, batchId: batch.id }))
              setAnnotationDraft({ x: 50, y: 42, part: '版型', content: '' })
              setAnnotationOpen(false)
            }}
          >
            添加并标记待处理
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={proposalOpen} onClose={() => setProposalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>提交改版方案 · 归属{batch.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="影响部位" value={proposalDraft.affectedPart} onChange={(event) => setProposalDraft({ ...proposalDraft, affectedPart: event.target.value })} />
            <FormControl size="small">
              <InputLabel>提交人角色</InputLabel>
              <Select label="提交人角色" value={proposalDraft.role} onChange={(event) => setProposalDraft({ ...proposalDraft, role: event.target.value })}>
                {['版师', '产品开发', '供应商', '质检'].map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField multiline minRows={3} label="方案内容" value={proposalDraft.content} onChange={(event) => setProposalDraft({ ...proposalDraft, content: event.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProposalOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!proposalDraft.affectedPart.trim() || !proposalDraft.content.trim()}
            onClick={() => {
              dispatch(addProposal({ ...proposalDraft, author: '当前用户' }))
              setProposalDraft({ affectedPart: '肩袖', content: '', role: '版师' })
              setProposalOpen(false)
            }}
          >
            提交方案
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decisionDialog)} onClose={() => setDecisionDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>填写采纳决定说明 · {batch.id}</DialogTitle>
        <DialogContent>
          <TextField autoFocus multiline minRows={3} fullWidth label="决定理由（必填）" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={!decisionReason.trim()} startIcon={<CancelOutlinedIcon />} onClick={() => submitDecision('未采纳')}>不采纳</Button>
          <Button variant="contained" disabled={!decisionReason.trim()} startIcon={<CheckCircleOutlineIcon />} onClick={() => submitDecision('已采纳')}>采纳方案</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
