import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Paper, TextField, Button, Typography, Box, CircularProgress } from '@mui/material'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

const getErrorMessage = (error: any) => {
  const data = error?.response?.data
  if (typeof data?.detail === 'string') {
    return data.detail
  }
  if (data && typeof data === 'object') {
    const [firstKey, firstValue] = Object.entries(data)[0] || []
    if (Array.isArray(firstValue)) {
      return `${firstKey}: ${firstValue[0]}`
    }
  }
  return error?.message || 'Xatolik yuz berdi'
}

function getRoleRedirect(role: string, isSuperuser: boolean) {
  if (isSuperuser || role === 'admin' || role === 'analyst' || role === 'tax_inspector') return '/'
  if (role === 'business_owner') return '/owner'
  if (role === 'cafe_manager') return '/cafe/manager'
  if (role === 'waiter') return '/cafe/waiter'
  return '/'
}

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated, isLoading, user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const redirect = getRoleRedirect(user.role || '', (user as any)?.is_superuser || false)
      navigate(redirect, { replace: true })
    }
  }, [isAuthenticated, isLoading, user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await login(username, password)
      toast.success('Muvaffaqiyatli kirildi')
      const { user } = useAuthStore.getState()
      const redirect = getRoleRedirect(user?.role || '', (user as any)?.is_superuser || false)
      navigate(redirect)
    } catch (error: any) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Asaka tumani raqamli iqtisodiyot
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Tizimga kirish
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Foydalanuvchi nomi"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Parol"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Kirilmoqda...' : 'Kirish'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  )
}

export default Login
