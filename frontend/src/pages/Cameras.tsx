import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { Videocam } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import CameraStream from '../components/CameraStream'

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

interface LocationOption {
  id: number
  name: string
}

interface EmployeeItem {
  id: number
  full_name: string
  position?: string | null
  is_registered: boolean
  is_active: boolean
}

interface AnalysisResult {
  message?: string
  status?: string
  analysis?: {
    detected_persons?: number
    detected_faces?: number
    identified_employees?: Array<{ id: number; name: string; confidence: number }>
    draft_employees?: Array<{
      employee_id: number
      employee_name: string
      seen_count: number
      auto_registered: boolean
    }>
    risk?: {
      risk_level?: string
      risk_score?: number
    }
  }
}

const extractErrorMessage = (error: any) => {
  const data = error?.response?.data
  if (typeof data?.detail === 'string') {
    return data.detail
  }
  if (typeof data?.message === 'string') {
    return data.message
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
  const [formLocationId, setFormLocationId] = useState<string>('')
  const [analysisByCamera, setAnalysisByCamera] = useState<Record<number, AnalysisResult>>({})

  const { data: cameras = [], isLoading, isError } = useQuery(['cameras', locationId], async () => {
    const response = await apiClient.get('cameras/', {
      params: locationId ? { location_id: locationId } : undefined,
    })
    return response.data
  })

  const { data: locations = [] } = useQuery<LocationOption[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<EmployeeItem[]>(
    ['employees', locationId],
    async () => {
      const response = await apiClient.get('employees/', {
        params: { location_id: locationId },
      })
      return response.data
    },
    {
      enabled: Boolean(locationId),
    }
  )

  const selectedLocation = useMemo(
    () => locations.find((location) => String(location.id) === locationId),
    [locationId, locations]
  )

  const connectMutation = useMutation((data: CameraPayload) => apiClient.post('cameras/', data), {
    onSuccess: () => {
      toast.success('Kamera muvaffaqiyatli qo‘shildi')
      queryClient.invalidateQueries('cameras')
      setOpen(false)
      setFormLocationId('')
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const analyzeMutation = useMutation((cameraId: number) => apiClient.post(`cameras/${cameraId}/analyze/`), {
    onMutate: (cameraId) => {
      setAnalyzeLoadingId(cameraId)
    },
    onSuccess: (response: any, cameraId: number) => {
      setAnalysisByCamera((previous) => ({
        ...previous,
        [cameraId]: response.data,
      }))
      queryClient.invalidateQueries('employees')
      toast.success(response?.data?.message || 'Tahlil bajarildi')
    },
    onSettled: () => {
      setAnalyzeLoadingId(null)
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

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
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4">Kameralar</Typography>
          <Typography variant="body2" color="text.secondary">
            Har qatorda 3 ta live kamera va tanlangan location xodimlari ko‘rinadi.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="camera-location-filter-label">Location bo‘yicha filter</InputLabel>
            <Select
              labelId="camera-location-filter-label"
              value={locationId}
              label="Location bo‘yicha filter"
              onChange={(event) => setLocationId(String(event.target.value))}
            >
              <MenuItem value="">Barcha locationlar</MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="contained" onClick={() => setOpen(true)}>
            Yangi kamera ulash
          </Button>
        </Box>
      </Box>

      {locationId && selectedLocation && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>{selectedLocation.name}</strong> locationiga tegishli kameralar va xodimlar ko‘rsatilmoqda.
        </Alert>
      )}

      {cameras.length === 0 ? (
        <Alert severity="warning">
          {locationId
            ? 'Tanlangan location uchun hozircha kamera topilmadi.'
            : 'Hozircha kamera qo‘shilmagan.'}
        </Alert>
      ) : (
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {cameras.map((camera: any) => {
            const analysis = analysisByCamera[camera.id]
            const riskLevel = analysis?.analysis?.risk?.risk_level
            const riskColor =
              riskLevel === 'critical' || riskLevel === 'high'
                ? 'error'
                : riskLevel === 'medium'
                  ? 'warning'
                  : 'success'

            return (
              <Grid item xs={12} sm={6} md={4} key={camera.id}>
                <Card sx={{ height: '100%' }}>
                  <CameraStream streamUrl={camera.stream_url} isActive={camera.is_active} />
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

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                      <Chip
                        label={camera.is_active ? 'Faol' : 'Nofaol'}
                        color={camera.is_active ? 'success' : 'default'}
                        size="small"
                      />
                      {analysis?.analysis?.detected_persons !== undefined && (
                        <Chip
                          label={`Odamlar: ${analysis.analysis.detected_persons}`}
                          color="primary"
                          size="small"
                        />
                      )}
                      {analysis?.analysis?.draft_employees?.length ? (
                        <Chip
                          label={`Auto draft: ${analysis.analysis.draft_employees.length}`}
                          color="warning"
                          size="small"
                        />
                      ) : null}
                      {riskLevel ? <Chip label={`Risk: ${riskLevel}`} color={riskColor} size="small" /> : null}
                    </Box>

                    {analysis?.analysis?.identified_employees?.length ? (
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        Tanilgan xodimlar:{' '}
                        {analysis.analysis.identified_employees.map((employee) => employee.name).join(', ')}
                      </Typography>
                    ) : null}

                    {analysis?.analysis?.draft_employees?.length ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Auto ro‘yxatga olinganlar:{' '}
                        {analysis.analysis.draft_employees
                          .map((employee) => employee.employee_name)
                          .join(', ')}
                      </Typography>
                    ) : null}

                    <Button
                      variant="outlined"
                      fullWidth
                      disabled={analyzeLoadingId === camera.id || analyzeMutation.isLoading}
                      onClick={() => analyzeMutation.mutate(camera.id)}
                    >
                      {analyzeLoadingId === camera.id ? 'Tahlil qilinmoqda...' : 'Analyze qilish'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      <Paper sx={{ mt: 3, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          {selectedLocation ? `${selectedLocation.name} xodimlari` : 'Location xodimlari'}
        </Typography>
        {!locationId ? (
          <Alert severity="info">Xodimlar ro‘yxatini ko‘rish uchun location tanlang.</Alert>
        ) : isEmployeesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : employees.length === 0 ? (
          <Alert severity="warning">Bu location uchun xodim topilmadi.</Alert>
        ) : (
          <List disablePadding>
            {employees.map((employee, index) => (
              <React.Fragment key={employee.id}>
                <ListItem disableGutters>
                  <ListItemText
                    primary={employee.full_name}
                    secondary={employee.position || (employee.is_registered ? 'Ro‘yxatdan o‘tgan' : 'AI draft xodim')}
                  />
                  <Chip
                    label={employee.is_registered ? 'Ro‘yxatdan o‘tgan' : 'Draft'}
                    color={employee.is_registered ? 'success' : 'warning'}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <Chip
                    label={employee.is_active ? 'Faol' : 'Nofaol'}
                    color={employee.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </ListItem>
                {index < employees.length - 1 ? <Divider /> : null}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>

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
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                SelectProps={{ native: true }}
              >
                <option value="" disabled>
                  Joylashuvni tanlang
                </option>
                {locations.map((loc) => (
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
