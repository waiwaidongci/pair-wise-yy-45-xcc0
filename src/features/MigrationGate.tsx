import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { retryMigrationAction } from './developmentSlice'

/**
 * 首次打开迁移失败时的兜底界面：保留原草稿并提供重试入口，
 * 不覆盖用户数据。
 */
export default function MigrationGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()
  const { migrationStatus, migrationError } = useAppSelector((state) => state.development)

  if (migrationStatus !== 'failed') return <>{children}</>

  return (
    <Box className="page" sx={{ maxWidth: 640, mx: 'auto', pt: 8 }}>
      <Alert severity="error" sx={{ mb: 2 }}>
        草稿迁移失败，原草稿已保留，未被覆盖。
      </Alert>
      <Box className="panel" sx={{ p: 3 }}>
        <Typography fontWeight={800} fontSize={18}>打样批次迁移未完成</Typography>
        <Typography color="text.secondary" fontSize={13} mt={1}>
          旧版草稿未按打样批次归档，首次打开需要把尺寸实测、批注和改版方案按批次补齐。
          迁移过程中出现问题，原始草稿已完整保留，你可以重试；重试仍会从原草稿重新迁移。
        </Typography>
        {migrationError && (
          <Box sx={{ mt: 1.5, p: 1.2, bgcolor: '#f7f3f1', borderRadius: 1, fontFamily: 'monospace', fontSize: 12, color: '#a24a2c' }}>
            失败原因：{migrationError}
          </Box>
        )}
        <Stack direction="row" spacing={1} mt={2.5}>
          <Button
            variant="contained"
            startIcon={<RestartAltIcon />}
            onClick={() => dispatch(retryMigrationAction())}
          >
            重试迁移
          </Button>
          <Button
            variant="outlined"
            onClick={() => dispatch(retryMigrationAction({ forceSeed: true }))}
          >
            重置为内置示例草稿
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}
