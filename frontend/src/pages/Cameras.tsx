import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Videocam } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'

interface CameraPayload {
  name: string
  ip_address: string
  port: number
  username?: string
  password?: string
  stream_url?: string
  camera_type: string
  location: number
}

const extractErrorMessage = (error: any) => {
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
  return error?.message || 'Kamera bilan ishlashda xatolik yuz berdi'
}

function Cameras() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [analyzeLoadingId, setAnalyzeLoadingId] = useState<number | null>(null)
  const [locationId, setLocationId] = useState<string>('')

  const { data: cameras = [], isLoading, isError } = useQuery('cameras', async () => {
    const response = await apiClient.get('cameras/')
    return response.data
  })

  const { data: locations = [] } = useQuery('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const connectMutation = useMutation(
    (data: CameraPayload) => apiClient.post('cameras/', data),
    {
      onSuccess: () => {
        toast.success('Kamera muvaffaqiyatli qo‘shildi')
        queryClient.invalidateQueries('cameras')
        setOpen(false)
        setLocationId('')
      },
      onError: (err: any) => {
        toast.error(extractErrorMessage(err))
      },
    }
  )

  const analyzeMutation = useMutation(
    (cameraId: number) => apiClient.post(`cameras/${cameraId}/analyze/`),
    {
      onMutate: (cameraId) => {
        setAnalyzeLoadingId(cameraId)
      },
      onSuccess: (response: any) => {
        toast.success(response?.data?.message || 'Tahlil boshlandi')
      },
      onSettled: () => {
        setAnalyzeLoadingId(null)
      },
      onError: (err: any) => {
        toast.error(extractErrorMessage(err))
      },
    }
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const raw = Object.fromEntries(formData.entries()) as Record<string, FormDataEntryValue>
    const port = raw.port ? Number(raw.port) : 80
    const ipAddress = (raw.ip_address as string) || ''

    const payload: CameraPayload = {
      name: (raw.name as string) || `Camera ${ipAddress}`,
      ip_address: ipAddress,
      port,
      username: (raw.username as string) || '',
      password: (raw.password as string) || '',
      stream_url: (raw.stream_url as string) || `rtsp://${ipAddress}:${port}/stream`,
      camera_type: (raw.camera_type as string) || 'internal',
      location: Number(raw.location_id),
    }

    connectMutation.mutate(payload)
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return <Alert severity="error">Kameralarni yuklashda xatolik!</Alert>
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Kameralar</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>
          Yangi kamera ulash
        </Button>
      </Box>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {cameras.map((camera: any) => (
          <Grid item xs={12} sm={6} md={4} key={camera.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Videocam sx={{ fontSize: 40, mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{camera.name || camera.ip_address}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {camera.ip_address}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {camera.location_name || '-'} • {camera.camera_type_display || camera.camera_type}
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={camera.is_active ? 'Faol' : 'Nofaol'}
                  color={camera.is_active ? 'success' : 'default'}
                  size="small"
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="outlined"
                  fullWidth
                  disabled={analyzeLoadingId === camera.id || analyzeMutation.isLoading}
                  onClick={() => analyzeMutation.mutate(camera.id)}
                >
                  {analyzeLoadingId === camera.id ? 'Tahlil boshlanmoqda...' : 'Tahlilni boshlash'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={handleSubmit}>
          <DialogTitle>Yangi kamera ulash</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <TextField name="name" label="Kamera nomi" fullWidth />
              <TextField name="ip_address" label="IP manzili" fullWidth required />
              <TextField name="port" label="Port" fullWidth defaultValue={80} />
              <TextField
                name="camera_type"
                label="Kamera turi"
                fullWidth
                select
                defaultValue="internal"
                SelectProps={{ native: true }}
              >
                <option value="entrance">Kirish</option>
                <option value="exit">Chiqish</option>
                <option value="internal">Ichki</option>
              </TextField>
              <TextField name="stream_url" label="Stream URL" fullWidth />
              <TextField name="username" label="Foydalanuvchi" fullWidth />
              <TextField
                name="password"
                label="Parol"
                fullWidth
                type="password"
                autoComplete="new-password"
              />
              <TextField
                name="location_id"
                label="Joylashuv"
                fullWidth
                select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                SelectProps={{ native: true }}
              >
                <option value="" disabled>
                  Joylashuvni tanlang
                </option>
                {locations.map((loc: any) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpen(false)} color="inherit">
              Bekor qilish
            </Button>
            <Button type="submit" variant="contained" disabled={connectMutation.isLoading}>
              {connectMutation.isLoading ? 'Ulanmoqda...' : 'Ulash'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  )
}

export default Cameras
