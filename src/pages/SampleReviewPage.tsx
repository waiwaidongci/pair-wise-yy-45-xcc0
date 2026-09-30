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
import AddRoadOutlinedIcon from '@mui/icons-material/AddRoadOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  addAnnotation,
  addProposal,
  approveRevision,
  decideProposal,
  rejectRevision,
  resolveAnnotation,
  saveDraftNote,
  setRounds,
  toggleAnnotation,
  updateMeasurements,
} from '../features/developmentSlice'
import type { Measurement, SamplingBatch } from '../api/types'

function effectiveBatch(sample: { batches: SamplingBatch[]; effectiveBatchId: string }): SamplingBatch {
  return sample.batches.find((batch) => batch.id === sample.effectiveBatchId) ?? sample.batches[sample.batches.length - 1]
}

export default function SampleReviewPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const batch = sample.batches.find((item) => item.round === state.roundB) ?? effectiveBatch(sample)
  const baseBatch = sample.batches.find((item) => item.round === state.roundA) ?? sample.batches[0]

  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalDraft, setProposalDraft] = useState({ author: '当前用户', role: '版师', content: '', affectedPart: '' })
  const [annotationDraft, setAnnotationDraft] = useState({ x: 50, y: 42, part: '版型', content: '' })
  const [measureDraft, setMeasureDraft] = useState<Measurement[]>([])
  const [measureOpen, setMeasureOpen] = useState(false)
  const imageRef = useRef<HTMLDivElement>(null)

  const locked = batch.locked

  const comparison = useMemo(() => {
    return baseBatch.measurements.map((item) => {
      const current = batch.measurements.find((measure) => measure.key === item.key) ?? item
      return {
        ...item,
        previous: item.actual,
        current: current.actual,
        delta: current.actual - item.actual,
        inTolerance: Math.abs(current.actual - current.spec) <= current.tolerance,
      }
    })
  }, [baseBatch, batch])

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
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
    dispatch(decideProposal({ sampleId: sample.id, batchId: batch.id, proposalId: decisionDialog, decision, reason: decisionReason }))
    setDecisionDialog(null)
    setDecisionReason('')
  }

  const openMeasureDialog = () => {
    setMeasureDraft(batch.measurements.map((item) => ({ ...item })))
    setMeasureOpen(true)
  }

  const saveMeasurements = () => {
    dispatch(updateMeasurements({ sampleId: sample.id, batchId: batch.id, measurements: measureDraft, reason: '尺寸实测调整' }))
    setMeasureOpen(false)
  }

  const pendingRevisions = batch.pendingRevisions

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">SAMPLE REVIEW / 样品评审</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · {batch.name}（{batch.round}）</Typography>
          <Typography color="text.secondary">尺寸实测、批注与改版方案按打样批次分开归档；锁定只冻结当前批次。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PhotoCameraBackOutlinedIcon />}>上传样衣照片</Button>
          <Button variant="contained" onClick={() => dispatch(saveDraftNote({ sampleId: sample.id, batchId: batch.id, notes: '评审草稿已保存' }))}>保存当前草稿</Button>
        </Stack>
      </Box>

      {locked && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          {batch.name}已审核锁定，本轮尺寸、批注与方案为只读；新增内容进入「待审修订」，不会改动已确认结论。
        </Alert>
      )}
      {!locked && batch.annotations.some((item) => item.status === '待处理') && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          当前批次仍有 {batch.annotations.filter((item) => item.status === '待处理').length} 项待处理批注，审核锁定前必须逐项关闭。
        </Alert>
      )}
      {!locked && batch.conclusion && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          本批次锁定结论已因尺寸或方案变化失效，需重新评审锁定。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.15fr) minmax(340px,.85fr)' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontWeight={800}>尺寸实测差异</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>基准批次</InputLabel>
                <Select label="基准批次" value={state.roundA} onChange={(event) => dispatch(setRounds({ a: event.target.value }))}>
                  {sample.batches.map((item) => <MenuItem key={item.id} value={item.round}>{item.round}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>对比批次</InputLabel>
                <Select label="对比批次" value={state.roundB} onChange={(event) => dispatch(setRounds({ b: event.target.value }))}>
                  {sample.batches.map((item) => <MenuItem key={item.id} value={item.round}>{item.round}</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" startIcon={<EditOutlinedIcon />} onClick={openMeasureDialog}>调整实测</Button>
            </Stack>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                  <TableCell>部位</TableCell>
                  <TableCell>规格</TableCell>
                  <TableCell>±容差</TableCell>
                  <TableCell>{baseBatch.round}</TableCell>
                  <TableCell>{batch.round}</TableCell>
                  <TableCell>变化</TableCell>
                  <TableCell>判定</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.map((item) => (
                  <TableRow key={item.key} sx={{ bgcolor: item.inTolerance ? 'transparent' : '#fff4ef' }}>
                    <TableCell sx={{ fontWeight: 750 }}>{item.name}</TableCell>
                    <TableCell>{item.spec} cm</TableCell>
                    <TableCell>±{item.tolerance}</TableCell>
                    <TableCell>{item.previous.toFixed(1)}</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: item.inTolerance ? '#2d7665' : '#b44b2d' }}>{item.current.toFixed(1)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`} color={Math.abs(item.delta) > 0.5 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={item.inTolerance ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />} label={item.inTolerance ? '达标' : '超差'} color={item.inTolerance ? 'success' : 'error'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ p: 1.5, borderTop: '1px solid #ece9e4' }}>
            <TextField
              multiline
              minRows={2}
              fullWidth
              size="small"
              label="批次评审草稿"
              defaultValue={state.draftNotes[`${sample.id}:${batch.id}`] ?? '本批次肩袖活动量已改善；建议采纳肩线内收方案，下一复核举臂舒适度。'}
              onBlur={(event) => dispatch(saveDraftNote({ sampleId: sample.id, batchId: batch.id, notes: event.target.value }))}
            />
          </Box>
        </Box>

        <Box className="panel">
          <Box sx={{ px: 1.8, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between' }}>
            <Typography fontWeight={800}>样衣部位批注 · {batch.round}</Typography>
            <Button size="small" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => setAnnotationOpen(true)}>添加批注</Button>
          </Box>
          <Box
            ref={imageRef}
            onClick={handleImageClick}
            sx={{
              position: 'relative',
              height: 420,
              m: 1.5,
              overflow: 'hidden',
              cursor: 'crosshair',
              borderRadius: 1.5,
              background: 'linear-gradient(180deg,#dfe5e4 0%,#cbd4d1 100%)',
              backgroundImage: 'linear-gradient(180deg,#dce4e2 0%,#c7d2cf 100%), repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.18) 40px)',
            }}
          >
            <Box sx={{ position: 'absolute', left: '50%', top: 32, transform: 'translateX(-50%)', width: 170, height: 55, border: '3px solid #526a65', borderRadius: '50% 50% 22% 22%', bgcolor: '#657d77' }} />
            <Box sx={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', width: 210, height: 230, border: '3px solid #526a65', borderRadius: '38px 38px 22px 22px', bgcolor: '#718983' }}>
              <Box sx={{ position: 'absolute', left: 50, top: 72, width: 110, height: 76, border: '1px dashed rgba(255,255,255,.6)', borderRadius: 2 }} />
              <Box sx={{ position: 'absolute', left: 35, top: 30, right: 35, borderTop: '2px solid rgba(255,255,255,.45)' }} />
              <Box sx={{ position: 'absolute', left: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
              <Box sx={{ position: 'absolute', right: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
            </Box>
            <Box sx={{ position: 'absolute', left: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '25px 8px 12px 25px', bgcolor: '#657d77', transform: 'rotate(7deg)' }} />
            <Box sx={{ position: 'absolute', right: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '8px 25px 25px 12px', bgcolor: '#657d77', transform: 'rotate(-7deg)' }} />
            {batch.annotations.map((annotation) => (
              <Tooltip key={annotation.id} title={`${annotation.part}：${annotation.content}`}>
                <Box
                  onClick={(event) => {
                    event.stopPropagation()
                    dispatch(toggleAnnotation(state.activeAnnotation === annotation.id ? null : annotation.id))
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
                    cursor: 'pointer',
                  }}
                >
                  {annotation.id.slice(-2)}
                </Box>
              </Tooltip>
            ))}
            <Chip label="点击样衣任意部位添加批注" size="small" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: 'rgba(255,255,255,.9)' }} />
          </Box>
          <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
            {batch.annotations.map((annotation) => (
              <Box key={annotation.id} sx={{ p: 1.2, borderLeft: `3px solid ${annotation.status === '待处理' ? '#cf6236' : '#397c69'}`, bgcolor: '#f8f7f4', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={800} fontSize={12}>{annotation.part} · {annotation.author}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" onClick={() => dispatch(toggleAnnotation(annotation.id))}>查看</Button>
                    {!locked && (
                      <Button size="small" onClick={() => dispatch(resolveAnnotation({ sampleId: sample.id, batchId: batch.id, annotationId: annotation.id }))}>
                        {annotation.status === '待处理' ? '标记关闭' : '重开'}
                      </Button>
                    )}
                  </Stack>
                </Stack>
                <Typography color="text.secondary" fontSize={11} mt={0.4}>{annotation.content}</Typography>
              </Box>
            ))}
            {batch.annotations.length === 0 && (
              <Typography color="text.secondary" fontSize={12} sx={{ px: 0.5 }}>本批次暂无批注。</Typography>
            )}
          </Stack>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={800}>替代修改方案与采纳决定</Typography>
          <Button size="small" startIcon={<AddRoadOutlinedIcon />} onClick={() => setProposalOpen(true)}>提交改版方案</Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5, p: 1.5 }}>
          {batch.proposals.map((proposal) => (
            <Box key={proposal.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={800}>{proposal.affectedPart} · {proposal.role}</Typography>
                <Chip size="small" label={proposal.status} color={proposal.status === '已采纳' ? 'success' : proposal.status === '未采纳' ? 'default' : 'warning'} />
              </Stack>
              <Typography fontSize={13} mt={1}>{proposal.content}</Typography>
              <Typography color="text.secondary" fontSize={11} mt={0.7}>提交人：{proposal.author}</Typography>
              {proposal.status === '待决定' && (
                <Button size="small" variant="outlined" sx={{ mt: 1.2 }} onClick={() => setDecisionDialog(proposal.id)}>
                  作出决定
                </Button>
              )}
            </Box>
          ))}
          {batch.proposals.length === 0 && (
            <Typography color="text.secondary" fontSize={12} sx={{ p: 0.5 }}>本批次暂无改版方案。</Typography>
          )}
        </Box>
      </Box>

      {pendingRevisions.length > 0 && (
        <Box className="panel" sx={{ mt: 1.5 }}>
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4' }}>
            <Typography fontWeight={800}>待审修订（锁定后新增，未改已确认内容）</Typography>
          </Box>
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {pendingRevisions.map((revision) => (
              <Box key={revision.id} sx={{ p: 1.2, border: '1px dashed #d8d2c8', borderRadius: 1, bgcolor: '#faf8f5' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={revision.kind} />
                    <Typography fontWeight={700} fontSize={13}>{revision.summary}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    {revision.status === '待审' ? (
                      <>
                        <Button size="small" color="success" onClick={() => dispatch(approveRevision({ sampleId: sample.id, batchId: batch.id, revisionId: revision.id }))}>通过并结转新批次</Button>
                        <Button size="small" color="inherit" onClick={() => dispatch(rejectRevision({ sampleId: sample.id, batchId: batch.id, revisionId: revision.id }))}>驳回</Button>
                      </>
                    ) : (
                      <Chip size="small" label={revision.status} color={revision.status === '已通过' ? 'success' : 'default'} />
                    )}
                  </Stack>
                </Stack>
                <Typography color="text.secondary" fontSize={11} mt={0.4}>提交于 {revision.createdAt}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Dialog open={annotationOpen} onClose={() => setAnnotationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>添加部位批注{locked && '（将进入待审修订）'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="详细部位" value={annotationDraft.part} onChange={(event) => setAnnotationDraft({ ...annotationDraft, part: event.target.value })} />
            <TextField multiline minRows={3} label="批注内容" value={annotationDraft.content} onChange={(event) => setAnnotationDraft({ ...annotationDraft, content: event.target.value })} />
            <Typography color="text.secondary" fontSize={12}>批注锚点：{annotationDraft.x}% / {annotationDraft.y}% · 批次 {batch.name}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnotationOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!annotationDraft.part.trim() || !annotationDraft.content.trim()}
            onClick={() => {
              dispatch(addAnnotation({ sampleId: sample.id, batchId: batch.id, draft: annotationDraft }))
              setAnnotationDraft({ x: 50, y: 42, part: '版型', content: '' })
              setAnnotationOpen(false)
            }}
          >
            {locked ? '提交为待审修订' : '添加并标记待处理'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={proposalOpen} onClose={() => setProposalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>提交改版方案{locked && '（将进入待审修订）'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="涉及部位" value={proposalDraft.affectedPart} onChange={(event) => setProposalDraft({ ...proposalDraft, affectedPart: event.target.value })} />
            <TextField label="提交角色" value={proposalDraft.role} onChange={(event) => setProposalDraft({ ...proposalDraft, role: event.target.value })} />
            <TextField multiline minRows={3} label="方案内容" value={proposalDraft.content} onChange={(event) => setProposalDraft({ ...proposalDraft, content: event.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProposalOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!proposalDraft.affectedPart.trim() || !proposalDraft.content.trim()}
            onClick={() => {
              dispatch(addProposal({ sampleId: sample.id, batchId: batch.id, draft: proposalDraft }))
              setProposalDraft({ author: '当前用户', role: '版师', content: '', affectedPart: '' })
              setProposalOpen(false)
            }}
          >
            {locked ? '提交为待审修订' : '提交方案'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={measureOpen} onClose={() => setMeasureOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>调整 {batch.name} 尺寸实测</DialogTitle>
        <DialogContent>
          {locked && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>调整尺寸将使本批锁定结论与审计记录失效，需重新评审锁定。</Alert>
          )}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>部位</TableCell>
                <TableCell>规格</TableCell>
                <TableCell>容差</TableCell>
                <TableCell>实测</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {measureDraft.map((item, index) => (
                <TableRow key={item.key}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.spec}</TableCell>
                  <TableCell>±{item.tolerance}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={item.actual}
                      onChange={(event) => {
                        const next = [...measureDraft]
                        next[index] = { ...item, actual: Number(event.target.value) }
                        setMeasureDraft(next)
                      }}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMeasureOpen(false)}>取消</Button>
          <Button variant="contained" onClick={saveMeasurements}>保存实测</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decisionDialog)} onClose={() => setDecisionDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>填写采纳决定说明</DialogTitle>
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
