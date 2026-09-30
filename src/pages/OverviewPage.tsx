import { Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectBatch, selectSample } from '../features/developmentSlice'
import { selectEffectiveBatch } from '../api/seed'

export default function OverviewPage() {
  const samples = useAppSelector((state) => state.development.samples)
  const pendingRevisions = useAppSelector((state) => state.development.pendingRevisions)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  // 总览只采用每个款式当前生效批次；已锁定但结论失效的批次按重算后的实时数据统计
  const effective = samples.map((sample) => ({ sample, batch: selectEffectiveBatch(sample) }))
  const pendingProposals = effective.reduce((sum, { batch }) => sum + batch.proposals.filter((proposal) => proposal.status === '待决定').length, 0)
  const pendingAnnotations = effective.reduce((sum, { batch }) => sum + batch.annotations.filter((annotation) => annotation.status === '待处理').length, 0)
  const pendingRevisionCount = pendingRevisions.filter((item) => item.status === '待审').length
  const staleCount = effective.filter(({ batch }) => batch.conclusion && !batch.conclusion.valid).length
  const averagePass = Math.round(
    (effective.reduce((sum, { batch }) => {
      const passed = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
      return sum + passed / batch.measurements.length
    }, 0) /
      effective.length) *
      100,
  )

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">PRODUCT DEVELOPMENT / 产品开发</Typography>
          <Typography component="h1" fontWeight={800}>打样批次总览</Typography>
          <Typography color="text.secondary">仅统计各款式当前生效批次；旧批次结论在修订历史中单独归档查回。</Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate('/review')}>进入样衣评审</Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
        {[
          ['在开发款式', samples.length, `${effective.length} 个当前生效批次`],
          ['尺寸达标率', `${averagePass}%`, '按生效批次实时重算'],
          ['待决定改版', pendingProposals, '需负责人采纳'],
          ['待处理批注', pendingAnnotations, pendingRevisionCount ? `另有 ${pendingRevisionCount} 条待审修订` : '按当前生效批次统计'],
        ].map(([label, value, hint]) => (
          <Box className="panel" key={String(label)} sx={{ p: 2 }}>
            <Typography color="#756f69" fontSize={12}>{label}</Typography>
            <Typography fontSize={{ xs: 26, md: 32 }} fontWeight={850} mt={0.8} color="#203634">{value}</Typography>
            <Typography color="#89837e" fontSize={11}>{hint}</Typography>
          </Box>
        ))}
      </Box>

      {staleCount > 0 && (
        <Box className="panel" sx={{ mb: 1.5, p: 1.5, borderColor: '#e2b3a2', display: 'flex', gap: 1.2, alignItems: 'center' }}>
          <WarningAmberRoundedIcon color="error" />
          <Box>
            <Typography fontWeight={800} fontSize={13} color="#b44b2d">{staleCount} 个生效批次的锁定结论已失效</Typography>
            <Typography fontSize={12} color="text.secondary">尺寸或方案发生变化，旧结论与审计记录已作废；下方数据为重算结果，请到修订历史页重新审核锁定。</Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.25fr .75fr' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ p: 1.8, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight={800}>近期待办款式（当前生效批次）</Typography>
            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/styles')}>全部档案</Button>
          </Box>
          {effective.map(({ sample, batch }) => {
            const pending = batch.proposals.filter((item) => item.status === '待决定').length + batch.annotations.filter((item) => item.status === '待处理').length
            const passed = batch.measurements.filter((item) => Math.abs(item.actual - item.spec) <= item.tolerance).length
            const stale = Boolean(batch.conclusion && !batch.conclusion.valid)
            const locked = batch.status === '已锁定'
            return (
              <Box key={sample.id} sx={{ p: 2, borderBottom: '1px solid #efede9', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 1.5 }}>
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography fontWeight={800}>{sample.styleCode} · {sample.styleName}</Typography>
                    <Chip size="small" label={`${batch.id}`} variant="outlined" />
                    <Chip
                      size="small"
                      label={stale ? '锁定结论失效' : batch.status}
                      color={stale ? 'error' : locked ? 'success' : batch.status === '待审核' ? 'warning' : 'default'}
                    />
                  </Stack>
                  <Typography color="text.secondary" fontSize={12} mt={0.8}>{sample.fabric} · {sample.colorway} · 交样 {sample.dueDate}</Typography>
                  <LinearProgress variant="determinate" value={(passed / batch.measurements.length) * 100} sx={{ mt: 1.5, maxWidth: 380, height: 6, borderRadius: 8 }} />
                </Box>
                <Box sx={{ alignSelf: 'center', textAlign: { sm: 'right' } }}>
                  <Typography color={pending ? '#ad552d' : '#43856a'} fontWeight={800}>
                    {pending ? `${pending} 项待处理` : stale ? '待重新锁定' : '无待办'}
                  </Typography>
                  <Typography color="text.secondary" fontSize={11}>负责人 {sample.owner}</Typography>
                  <Button
                    size="small"
                    sx={{ mt: 0.8 }}
                    onClick={() => {
                      dispatch(selectSample(sample.id))
                      dispatch(selectBatch(batch.id))
                      navigate('/review')
                    }}
                  >
                    查看批次
                  </Button>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box className="panel" sx={{ p: 2 }}>
          <Typography fontWeight={800} mb={1.5}>本周节点</Typography>
          <Stack spacing={1.4}>
            {[
              ['10-01', '第三轮样衣到达', '仓库收样并完成外观拍照'],
              ['10-08', '试穿评审会', '产品、版师、品类负责人'],
              ['10-12', 'WR-26AW-018 定版', '锁定第三轮尺寸与工艺包'],
              ['10-18', 'WR-26AW-021 供应商截止', '门襟定位模板确认'],
            ].map(([date, title, desc], index) => (
              <Box key={title} sx={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 1.2, position: 'relative' }}>
                <Typography color="#27756c" fontWeight={800} fontSize={12} fontFamily="monospace">{date}</Typography>
                <Box sx={{ borderLeft: index === 0 ? '3px solid #d47b3d' : '3px solid #dce4e1', pl: 1.2, pb: 1.2 }}>
                  <Typography fontWeight={750} fontSize={13}>{title}</Typography>
                  <Typography color="text.secondary" fontSize={11} mt={0.3}>{desc}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
