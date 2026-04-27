import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, CircularProgress } from '@mui/material'

import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Locations from './pages/Locations'
import LocationsMapWindow from './pages/LocationsMapWindow'
import Analytics from './pages/Analytics'
import Employees from './pages/Employees'
import Cameras from './pages/Cameras'
import WaiterDashboard from './pages/waiter/WaiterDashboard'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import KitchenDashboard from './pages/kitchen/KitchenDashboard'
import BusinessOwnerDashboard from './pages/owner/BusinessOwnerDashboard'

import { useAuthStore } from './store/authStore'

const queryClient = new QueryClient()

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
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
  useEffect(() => { bootstrapAuth() }, [bootstrapAuth])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/locations-map" element={<AdminRoute><LocationsMapWindow /></AdminRoute>} />

            {/* Cafe waiter */}
            <Route path="/cafe/waiter" element={<RoleRoute roles={['waiter']}><WaiterDashboard /></RoleRoute>} />

            {/* Cafe manager */}
            <Route path="/cafe/manager" element={<RoleRoute roles={['cafe_manager']}><ManagerDashboard /></RoleRoute>} />

            {/* Kitchen */}
            <Route path="/cafe/kitchen" element={<RoleRoute roles={['kitchen', 'cafe_manager']}><KitchenDashboard /></RoleRoute>} />

            {/* Business owner */}
            <Route path="/owner" element={<RoleRoute roles={['business_owner']}><BusinessOwnerDashboard /></RoleRoute>} />

            {/* Superadmin / Admin panel — only superadmin, admin, analyst, tax_inspector */}
            <Route path="/" element={<AdminRoute><Layout /></AdminRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="locations" element={<Locations />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="employees" element={<Employees />} />
              <Route path="cameras" element={<Cameras />} />
            </Route>

            <Route path="*" element={<RoleBasedRedirect />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
