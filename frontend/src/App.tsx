import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, CircularProgress } from '@mui/material'

import Layout from './components/Layout'
import Login from './pages/Login'
import Profiles from './pages/Profiles'
import Dashboard from './pages/Dashboard'
import Locations from './pages/Locations'
import LocationsMapWindow from './pages/LocationsMapWindow'
import Analytics from './pages/Analytics'
import Employees from './pages/Employees'
import PotentialEmployees from './pages/PotentialEmployees'
import Cameras from './pages/Cameras'
import TaxReports from './pages/TaxReports'
import Governance from './pages/Governance'
import WaiterDashboard from './pages/waiter/WaiterDashboard'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import KitchenDashboard from './pages/kitchen/KitchenDashboard'
import BusinessOwnerDashboard from './pages/owner/BusinessOwnerDashboard'

import { useAuthStore } from './store/authStore'
import { ThemeModeContext } from './themeMode'

const queryClient = new QueryClient()

const buildTheme = (darkMode: boolean) => createTheme({
  palette: {
    mode: darkMode ? 'dark' : 'light',
    primary: { main: darkMode ? '#54b7ff' : '#1769e0' },
    secondary: { main: darkMode ? '#b38cff' : '#7249db' },
    background: darkMode ? { default: '#07111f', paper: '#101e31' } : { default: '#f4f8fc', paper: '#ffffff' },
  },
  shape: { borderRadius: 14 },
  typography: { fontFamily: "Inter, Nunito, Segoe UI, sans-serif", h4: { fontWeight: 850, letterSpacing: '-0.04em' }, h6: { fontWeight: 800 }, body1: { letterSpacing: '0.01em' } },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: darkMode ? 'linear-gradient(135deg, rgba(19,38,61,.97), rgba(11,25,43,.97))' : 'linear-gradient(135deg, rgba(255,255,255,.98), rgba(242,248,255,.98))', border: darkMode ? '1px solid rgba(126, 179, 235, .16)' : '1px solid rgba(30, 84, 145, .09)', boxShadow: darkMode ? '0 18px 50px rgba(0,0,0,.22)' : '0 12px 32px rgba(17,68,120,.09)', transition: 'transform .2s ease, box-shadow .2s ease' } } },
    MuiCard: { styleOverrides: { root: { backgroundImage: darkMode ? 'linear-gradient(145deg, rgba(21,48,78,.98), rgba(12,28,49,.98))' : 'linear-gradient(145deg, #ffffff, #f3f8ff)', border: darkMode ? '1px solid rgba(84,183,255,.2)' : '1px solid rgba(23,105,224,.1)', boxShadow: darkMode ? '0 14px 34px rgba(0,0,0,.18)' : '0 10px 26px rgba(23,105,224,.08)', transition: 'transform .2s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: darkMode ? '0 18px 42px rgba(84,183,255,.16)' : '0 16px 34px rgba(23,105,224,.15)' } } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: darkMode ? 'linear-gradient(100deg, #0a1930, #102c4d)' : 'linear-gradient(100deg, #ffffff, #edf6ff)', color: darkMode ? '#edf7ff' : '#10203a', boxShadow: 'none', borderBottom: darkMode ? '1px solid rgba(94,183,255,.2)' : '1px solid #dceaf8' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700 } } },
  },
})

function LoadingBox() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  )
}

// Only superadmin / admin / analyst / tax_inspector can access the main admin panel
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  if (isLoading) return <LoadingBox />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const u = user as any
  if (u?.is_superuser || ['admin', 'analyst', 'tax_inspector'].includes(user?.role || '')) {
    return <>{children}</>
  }
  return <RoleBasedRedirect />
}

// Generic role-gated route
function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  if (isLoading) return <LoadingBox />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const u = user as any
  if (u?.is_superuser || roles.includes(user?.role || '')) return <>{children}</>
  return <RoleBasedRedirect />
}

// Redirects the user to their correct dashboard based on role
function RoleBasedRedirect() {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  const u = user as any
  if (u?.is_superuser || ['admin', 'analyst', 'tax_inspector'].includes(user.role)) return <Navigate to="/" replace />
  if (user.role === 'business_owner') return <Navigate to="/owner" replace />
  if (user.role === 'cafe_manager') return <Navigate to="/cafe/manager" replace />
  if (user.role === 'waiter') return <Navigate to="/cafe/waiter" replace />
  if (user.role === 'kitchen') return <Navigate to="/cafe/kitchen" replace />
  return <Navigate to="/login" replace />
}

function App() {
  const bootstrapAuth = useAuthStore((state) => state.bootstrapAuth)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme-mode') !== 'light')
  useEffect(() => { bootstrapAuth() }, [bootstrapAuth])
  const theme = useMemo(() => buildTheme(darkMode), [darkMode])
  const toggleDarkMode = () => setDarkMode((current) => { const next = !current; localStorage.setItem('theme-mode', next ? 'dark' : 'light'); return next })

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/locations-map" element={<AdminRoute><LocationsMapWindow /></AdminRoute>} />

            {/* Cafe waiter */}
            <Route path="/cafe/waiter" element={<RoleRoute roles={['waiter']}><WaiterDashboard /></RoleRoute>} />

            {/* Cafe manager */}
            <Route path="/cafe/manager" element={<RoleRoute roles={['cafe_manager']}><ManagerDashboard /></RoleRoute>} />

            {/* Kitchen */}
            <Route path="/cafe/kitchen" element={<RoleRoute roles={['kitchen', 'cafe_manager']}><KitchenDashboard /></RoleRoute>} />

            {/* Business owner */}
            <Route path="/owner" element={<RoleRoute roles={['business_owner']}><BusinessOwnerDashboard /></RoleRoute>} />
            <Route path="/owner/:page" element={<RoleRoute roles={['business_owner']}><BusinessOwnerDashboard /></RoleRoute>} />

            {/* Superadmin / Admin panel — only superadmin, admin, analyst, tax_inspector */}
            <Route path="/" element={<AdminRoute><Layout /></AdminRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="locations" element={<Locations />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="analytics/:locationId" element={<Analytics />} />
              <Route path="employees" element={<Employees />} />
              <Route path="potential-employees" element={<RoleRoute roles={['tax_inspector']}><PotentialEmployees /></RoleRoute>} />
              <Route path="cameras" element={<RoleRoute roles={['admin', 'analyst']}><Cameras /></RoleRoute>} />
              <Route path="tax-reports" element={<RoleRoute roles={['tax_inspector', 'admin']}><TaxReports /></RoleRoute>} />
              <Route path="governance" element={<RoleRoute roles={['admin']}><Governance /></RoleRoute>} />
              <Route path="profiles" element={<RoleRoute roles={['admin']}><Profiles /></RoleRoute>} />
            </Route>

            <Route path="*" element={<RoleBasedRedirect />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </ThemeProvider>
      </ThemeModeContext.Provider>
    </QueryClientProvider>
  )
}

export default App
