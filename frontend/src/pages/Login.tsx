import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container, Paper, TextField, Button, Typography, Box } from '@mui/material'
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

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await login(username, password)
      toast.success('Muvaffaqiyatli kirildi')
      navigate('/')
    } catch (error: any) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
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
            Digital Service Platform
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
          <Box sx={{ textAlign: 'center' }}>
            <Link to="/register" style={{ textDecoration: 'none', color: '#1976d2', fontWeight: 500 }}>
              Akkauntingiz yo'qmi? Ro'yxatdan o'ting
            </Link>
          </Box>
        </Paper>
      </Box>
    </Container>
  )
}

export default Login
