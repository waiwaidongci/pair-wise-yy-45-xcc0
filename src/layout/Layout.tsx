import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined'
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { retryMigration } from '../features/developmentSlice'

const nav = [
  { to: '/', label: '开发总览', icon: <DashboardOutlinedIcon /> },
  { to: '/styles', label: '款式档案', icon: <Inventory2OutlinedIcon /> },
  { to: '/review', label: '样品评审', icon: <CompareArrowsOutlinedIcon /> },
  { to: '/history', label: '修订历史', icon: <HistoryOutlinedIcon /> },
]

function MigrationBanner() {
  const dispatch = useAppDispatch()
  const migration = useAppSelector((state) => state.development.migration)
  if (migration.status !== 'failed') return null
  return (
    <Alert
      severity="error"
      variant="filled"
      sx={{ borderRadius: 0 }}
      action={
        <Button color="inherit" size="small" startIcon={<RestartAltOutlinedIcon />} onClick={() => dispatch(retryMigration())}>
          重试迁移
        </Button>
      }
    >
      旧草稿按打样批次迁移失败，原草稿已完整保留、未被覆盖：{migration.error}
    </Alert>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const drawer = (
    <Box sx={{ width: 242, minHeight: '100%', bgcolor: '#262a2b', color: '#eef1ef' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.2, borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', border: '1px solid #74aaa0', borderRadius: 1 }}>
          <CheckroomIcon fontSize="small" />
        </Box>
        <Box>
          <Typography fontWeight={800} fontSize={14}>MORROW 开发台</Typography>
          <Typography color="#9aa6a3" fontSize={11}>2026 秋冬 · 女装</Typography>
        </Box>
      </Box>
      <List sx={{ px: 1.2, py: 2 }}>
        {nav.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            sx={{
              color: '#cbd3d1',
              borderRadius: 1,
              mb: 0.4,
              '&.active': { color: '#fff', bgcolor: '#374a48', boxShadow: 'inset 3px 0 #6eb0a4' },
            }}
          >
            <Box sx={{ mr: 1.2, display: 'flex' }}>{item.icon}</Box>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13, fontWeight: 650 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mx: 1.5, mt: 'auto', p: 1.5, border: '1px solid rgba(255,255,255,.1)', borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <CloudDoneOutlinedIcon sx={{ fontSize: 16, color: '#74b79d' }} />
          <Typography fontSize={11}>草稿已实时保存</Typography>
        </Box>
        <Typography color="#8f9a98" fontSize={10} mt={0.8}>最后同步 16:42 · 3 位协作者</Typography>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="transparent" elevation={0} sx={{ display: { md: 'none' }, bgcolor: '#262a2b' }}>
        <Toolbar sx={{ minHeight: 52 }}>
          <IconButton color="inherit" onClick={() => setMobileOpen(true)}><MenuIcon /></IconButton>
          <Typography fontWeight={800} ml={1}>MORROW 开发台</Typography>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: 242 }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { xs: 'block', md: 'none' } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: 242, border: 0 } }}>
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: { xs: '52px', md: 0 } }}>
        <MigrationBanner />
        <Outlet />
      </Box>
    </Box>
  )
}
