import { Box, Chip, Stack, Typography } from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import type { Sample } from '../api/types'
import { ROUND_IDS } from '../api/types'
import { selectEffectiveBatch } from '../api/seed'

const statusColor: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  未开始: 'default',
  开发中: 'info',
  待审核: 'warning',
  已锁定: 'success',
}

type Props = {
  sample: Sample
  selected: '第一轮' | '第二轮' | '第三轮'
  onSelect: (round: '第一轮' | '第二轮' | '第三轮') => void
}

export default function BatchTabs({ sample, selected, onSelect }: Props) {
  const effective = selectEffectiveBatch(sample).id
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {ROUND_IDS.map((round) => {
        const batch = sample.batches[round]
        const active = round === selected
        const isEffective = round === effective
        const stale = batch.conclusion && !batch.conclusion.valid
        return (
          <Box
            key={round}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(round)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(round)
            }}
            sx={{
              cursor: 'pointer',
              minWidth: 168,
              p: 1.1,
              borderRadius: 1.4,
              border: active ? '2px solid #1d6d65' : '1px solid #e2dfda',
              bgcolor: active ? '#edf5f2' : '#fff',
              boxShadow: active ? 'inset 3px 0 #1d6d65' : 'none',
            }}
          >
            <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography fontWeight={800} fontSize={13}>
                {round}
              </Typography>
              {isEffective && <Chip size="small" label="当前生效" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
              {batch.status === '已锁定' && <LockOutlinedIcon sx={{ fontSize: 14, color: '#2d7665' }} />}
              {stale && <WarningAmberRoundedIcon sx={{ fontSize: 15, color: '#b44b2d' }} />}
            </Stack>
            <Stack direction="row" spacing={0.6} alignItems="center" mt={0.6} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={stale ? '结论已失效' : batch.status} color={stale ? 'error' : statusColor[batch.status]} sx={{ height: 18, fontSize: 10 }} />
              <Typography fontSize={10} color="text.secondary">
                {batch.measurements.length} 尺寸 · {batch.annotations.length} 批注 · {batch.proposals.length} 方案
              </Typography>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
