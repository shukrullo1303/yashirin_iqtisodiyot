import React, { useContext } from 'react'
import { useQuery } from 'react-query'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
  Chip,
  IconButton,
  Tooltip,
  Badge,
  Popover,
  ListItemAvatar,
  Avatar,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  LocationOn as LocationIcon,
  Analytics as AnalyticsIcon,
  People as PeopleIcon,
  PersonSearch as PersonSearchIcon,
  Videocam as CameraIcon,
  Logout as LogoutIcon,
  PersonAdd as PersonAddIcon,
  ReceiptLong as ReceiptLongIcon,
  History as HistoryIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  AutoAwesome as AutoAwesomeIcon,
  NotificationsNone as NotificationsIcon,
} from '@mui/icons-material'
import { useAuthStore } from '../store/authStore'
import { ThemeModeContext } from '../themeMode'
import apiClient from '../api/client'

const drawerWidth = 240

const adminMenuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Lokatsiyalar', icon: <LocationIcon />, path: '/locations' },
  { text: 'Analitika', icon: <AnalyticsIcon />, path: '/analytics' },
  { text: 'Xodimlar', icon: <PeopleIcon />, path: '/employees' },
  { text: 'Kameralar', icon: <CameraIcon />, path: '/cameras' },
]

function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useContext(ThemeModeContext)
  const [notificationAnchor, setNotificationAnchor] = React.useState<HTMLButtonElement | null>(null)
  const notifications = useQuery<any[]>('header-notifications', async () => (await apiClient.get('notifications/')).data, { refetchInterval: 30000 })
  const unread = (notifications.data || []).filter((item) => !item.is_read)
  const isSuperadmin = Boolean(user?.is_superuser)
  const roleMenuItems = isSuperadmin
    ? adminMenuItems
    : user?.role === 'tax_inspector'
      ? [adminMenuItems[0], adminMenuItems[2], { text: 'Ehtimoliy xodimlar', icon: <PersonSearchIcon />, path: '/potential-employees' }, adminMenuItems[3], { text: 'Soliq ma’lumotlari', icon: <ReceiptLongIcon />, path: '/tax-reports' }]
      : [adminMenuItems[0], adminMenuItems[2]]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1.2 }}><AutoAwesomeIcon color="primary" /><Typography variant="h6" noWrap component="div">Asaka tumani raqamli iqtisodiyot</Typography><Chip size="small" color="primary" variant="outlined" label="AI MONITORING ONLINE" sx={{ fontWeight: 800, letterSpacing: .6, display: { xs: 'none', md: 'inline-flex' } }} /></Box>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.full_name}
          </Typography>
          <Tooltip title="Bildirishnomalar"><IconButton color="inherit" onClick={(event) => setNotificationAnchor(event.currentTarget)}><Badge badgeContent={unread.length} color="error"><NotificationsIcon /></Badge></IconButton></Tooltip>
          <Tooltip title={darkMode ? 'Kunduzgi rejim' : 'Night mode'}><IconButton onClick={toggleDarkMode} color="inherit">{darkMode ? <LightModeIcon /> : <DarkModeIcon />}</IconButton></Tooltip>
          <Popover open={Boolean(notificationAnchor)} anchorEl={notificationAnchor} onClose={() => setNotificationAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}><Box sx={{ width: 380, p: 1 }}><Typography fontWeight={800} sx={{ px: 1, py: .75 }}>AI bildirishnomalari</Typography>{unread.length ? unread.slice(0, 6).map((item) => <ListItem key={item.id} alignItems="flex-start"><ListItemAvatar><Avatar sx={{ bgcolor: item.level === 'error' ? 'error.main' : item.level === 'warning' ? 'warning.main' : 'primary.main' }}><AutoAwesomeIcon fontSize="small"/></Avatar></ListItemAvatar><ListItemText primary={item.title} secondary={`${item.location_name ? `${item.location_name} - ` : ''}${item.message}`} /></ListItem>) : <Typography color="text.secondary" sx={{ p: 2 }}>Yangi bildirishnoma yo‘q.</Typography>}</Box></Popover>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: '1px solid', borderColor: 'divider',
            backgroundImage: darkMode ? 'linear-gradient(180deg, #0a1728, #0d223b)' : 'linear-gradient(180deg, #fff, #f1f7fd)',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', px: 1 }}>
          <Box sx={{ px: 1.5, pt: 2, pb: 1 }}><Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: 1.1 }}>AI CONTROL CENTER</Typography><Typography variant="caption" display="block" color="text.secondary">Kamera, tashrif va risk kuzatuvi</Typography></Box>
          <List>
            {[...roleMenuItems, ...(isSuperadmin ? [{ text: 'Soliq ma’lumotlari', icon: <ReceiptLongIcon />, path: '/tax-reports' }, { text: 'Nazorat jurnali', icon: <HistoryIcon />, path: '/governance' }, { text: 'Yangi profil', icon: <PersonAddIcon />, path: '/profiles' }] : [])].map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  sx={{ borderRadius: 2, mb: .5, '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', boxShadow: '0 6px 18px rgba(50,150,255,.25)', '& .MuiListItemIcon-root': { color: 'primary.contrastText' } } }}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
            <ListItem disablePadding>
              <ListItemButton onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon />
                </ListItemIcon>
              <ListItemText primary="Chiqish" />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default', backgroundImage: darkMode ? 'radial-gradient(circle at 82% 4%, rgba(38,121,206,.18), transparent 32%), radial-gradient(circle at 14% 93%, rgba(117,75,208,.13), transparent 28%)' : 'radial-gradient(circle at 82% 4%, rgba(64,150,255,.12), transparent 30%)',
          p: 3,
        }}
      >
        <Toolbar />
        <Container maxWidth="xl">
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}

export default Layout
