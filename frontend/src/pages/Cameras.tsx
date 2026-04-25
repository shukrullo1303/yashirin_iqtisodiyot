import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  IconButton,
  InputLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { Videocam, Edit, Delete } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import { asList } from '../utils/asList'
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
  phone?: string | null
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
      seen_count?: number
      seen_minutes?: number
      auto_registered?: boolean
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
  const [analyzeLoadingByCamera, setAnalyzeLoadingByCamera] = useState<Record<number, boolean>>({})
  const [analyzeAllLoading, setAnalyzeAllLoading] = useState(false)
  const [locationId, setLocationId] = useState<string>('')
  const [formLocationId, setFormLocationId] = useState<string>('')
  const [analysisByCamera, setAnalysisByCamera] = useState<Record<number, AnalysisResult>>({})
  const [analysisActiveByCamera, setAnalysisActiveByCamera] = useState<Record<number, boolean>>({})
  const analysisPollingRef = useRef<Record<number, number>>({})
  const analysisPendingRef = useRef<Record<number, boolean>>({})

  const camerasQuery = useQuery(['cameras', locationId], async () => {
    const response = await apiClient.get('cameras/', {
      params: locationId ? { location_id: locationId } : undefined,
    })
    return response.data
  })

  const locationsQuery = useQuery<unknown>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const employeesQuery = useQuery<unknown>(
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

  const cameras = asList<any>(camerasQuery.data)
  const locations = asList<LocationOption>(locationsQuery.data)
  const employees = asList<EmployeeItem>(employeesQuery.data)
  const isLoading = camerasQuery.isLoading
  const isError = camerasQuery.isError
  const isEmployeesLoading = employeesQuery.isLoading

  const selectedLocation = useMemo(
    () => locations.find((location) => String(location.id) === locationId),
    [locationId, locations]
  )

  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({ full_name: '', phone: '', position: '' })

  const editEmployeeMutation = useMutation(
    (payload: { id: number; data: Partial<EmployeeItem> }) => apiClient.patch(`employees/${payload.id}/`, payload.data),
    {
      onSuccess: () => {
        toast.success('Xodim yangilandi')
        queryClient.invalidateQueries(['employees', locationId])
        setEditDialogOpen(false)
        setEditingEmployee(null)
      },
      onError: (error) => {
        toast.error(extractErrorMessage(error))
      },
    }
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

  const deleteCameraMutation = useMutation((cameraId: number) => apiClient.delete(`cameras/${cameraId}/`), {
    onSuccess: () => {
      toast.success('Kamera o‘chirildi')
      queryClient.invalidateQueries('cameras')
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const analyzeAllMutation = useMutation(
    async () => {
      const body = locationId ? { location_id: Number(locationId) } : {}
      const response = await apiClient.post('cameras/analyze-active/', body)
      return response.data as {
        count?: number
        results?: AnalysisResult[]
        errors?: Array<{ camera_id: number; error: string }>
        message?: string
      }
    },
    {
      onMutate: () => setAnalyzeAllLoading(true),
      onSettled: () => setAnalyzeAllLoading(false),
      onSuccess: (data) => {
        const rows = data?.results || []
        if (!rows.length && data?.message) {
          toast(data.message)
          return
        }
        setAnalysisByCamera((previous) => {
          const next = { ...previous }
          for (const row of rows) {
            const id = (row as { camera_id?: number }).camera_id
            if (id != null) next[id] = row as AnalysisResult
          }
          return next
        })
        const errCount = data?.errors?.length ?? 0
        toast.success(
          errCount
            ? `${rows.length} kamera tahlillandi, ${errCount} ta xato`
            : `${rows.length} kamera parallel tahlillandi`
        )
        queryClient.invalidateQueries('employees')
      },
      onError: (err: any) => {
        toast.error(extractErrorMessage(err))
      },
    }
  )

  const analyzeMutation = useMutation((cameraId: number) => apiClient.post(`cameras/${cameraId}/analyze/`), {
    onMutate: (cameraId) => {
      setAnalyzeLoadingByCamera((prev) => ({ ...prev, [cameraId]: true }))
    },
    onSuccess: (response: any, cameraId: number) => {
      setAnalysisByCamera((previous) => ({
        ...previous,
        [cameraId]: response.data,
      }))
      queryClient.invalidateQueries('employees')
      toast.success(response?.data?.message || 'Tahlil bajarildi')
    },
    onSettled: (data, error, cameraId) => {
      setAnalyzeLoadingByCamera((prev) => ({ ...prev, [cameraId]: false }))
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const runAnalysisForCamera = (cameraId: number) => {
    if (analysisPendingRef.current[cameraId]) {
      return
    }

    analysisPendingRef.current[cameraId] = true
    analyzeMutation.mutate(cameraId, {
      onSuccess: (response: any) => {
        setAnalysisByCamera((previous) => ({
          ...previous,
          [cameraId]: response.data,
        }))
        queryClient.invalidateQueries('employees')
      },
      onError: () => {
        // Manual analysis errors are shown by the mutation handler.
      },
      onSettled: () => {
        analysisPendingRef.current[cameraId] = false
      },
    })
  }

  const startAnalysis = (cameraId: number) => {
    if (analysisPollingRef.current[cameraId]) {
      return
    }

    setAnalysisActiveByCamera((previous) => ({
      ...previous,
      [cameraId]: true,
    }))

    runAnalysisForCamera(cameraId)
    const intervalId = window.setInterval(() => runAnalysisForCamera(cameraId), 5 * 60 * 1000)
    analysisPollingRef.current[cameraId] = intervalId
  }

  const stopAnalysis = (cameraId: number) => {
    const intervalId = analysisPollingRef.current[cameraId]
    if (intervalId) {
      window.clearInterval(intervalId)
      delete analysisPollingRef.current[cameraId]
    }
    analysisPendingRef.current[cameraId] = false
    setAnalysisActiveByCamera((previous) => ({
      ...previous,
      [cameraId]: false,
    }))
  }

  useEffect(() => {
    return () => {
      Object.values(analysisPollingRef.current).forEach((intervalId) => {
        window.clearInterval(intervalId)
      })
      analysisPollingRef.current = {}
    }
  }, [])

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

          <Button
            variant="outlined"
            disabled={
              analyzeAllLoading ||
              cameras.length === 0 ||
              !cameras.some((c: { is_active?: boolean }) => c.is_active)
            }
            onClick={() => analyzeAllMutation.mutate()}
          >
            {analyzeAllLoading ? 'Tahlil...' : 'Aktiv kameralarni parallel tahlil'}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            disabled={connectMutation.isLoading}
            onClick={() => {
              if (locations.length === 0) {
                toast.error("Avval location qo'shing")
                return
              }
              connectMutation.mutate({
                name: 'Demo Webcam',
                ip_address: '127.0.0.1',
                port: 0,
                stream_url: '0',
                camera_type: 'internal',
                location: locations[0].id,
              })
            }}
          >
            Webcam Demo
          </Button>
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
                  <CameraStream
                    streamUrl={camera.stream_url || `rtsp://${camera.ip_address}:${camera.port}/stream`}
                    isActive={Boolean(camera.stream_url || camera.ip_address)}
                    locationId={locationId ? Number(locationId) : null}
                  />
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
                        label={camera.is_active ? 'Ulangan' : 'Ulanmagan'}
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

                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      {analysisActiveByCamera[camera.id] ? (
                        <Button
                          variant="contained"
                          color="error"
                          fullWidth
                          onClick={() => stopAnalysis(camera.id)}
                        >
                          Tahlilni to‘xtatish
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          fullWidth
                          disabled={analysisPendingRef.current[camera.id] || analyzeLoadingByCamera[camera.id]}
                          onClick={() => startAnalysis(camera.id)}
                        >
                          Tahlilni boshlash
                        </Button>
                      )}
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" color="primary">
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={deleteCameraMutation.isLoading}
                          onClick={() => {
                            if (window.confirm('Bu kamerani o‘chirishni xohlaysizmi?')) {
                              deleteCameraMutation.mutate(camera.id)
                            }
                          }}
                        >
                          <Delete />
                        </IconButton>
                      </Box>
                    </Box>
                    {analysisActiveByCamera[camera.id] && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Kamera uchun fon rejimida analiz davom etadi.
                      </Typography>
                    )}
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingEmployee(employee)
                        setEditFormData({
                          full_name: employee.full_name,
                          phone: (employee as any).phone || '',
                          position: employee.position || '',
                        })
                        setEditDialogOpen(true)
                      }}
                    >
                      <Edit />
                    </IconButton>
                    <Chip
                      label={employee.is_registered ? 'Ro‘yxatdan o‘tgan' : 'Draft'}
                      color={employee.is_registered ? 'success' : 'warning'}
                      size="small"
                    />
                    <Chip
                      label={employee.is_active ? 'Faol' : 'Nofaol'}
                      color={employee.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                </ListItem>
                {index < employees.length - 1 ? <Divider /> : null}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!editingEmployee) return
            editEmployeeMutation.mutate({
              id: editingEmployee.id,
              data: {
                full_name: editFormData.full_name,
                phone: editFormData.phone,
                position: editFormData.position,
              },
            })
          }}
        >
          <DialogTitle>Xodimni tahrirlash</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <TextField
                label="F.I.Sh."
                value={editFormData.full_name}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                fullWidth
                required
              />
              <TextField
                label="Lavozim"
                value={editFormData.position}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, position: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Telefon"
                value={editFormData.phone}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))}
                fullWidth
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditDialogOpen(false)} color="inherit">
              Bekor qilish
            </Button>
            <Button type="submit" variant="contained" disabled={editEmployeeMutation.isLoading}>
              Saqlash
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <form onSubmit={handleSubmit}>
          <DialogTitle>Yangi kamera ulash</DialogTitle>
          <DialogContent dividers>
            <Alert severity="info" sx={{ mb: 2, '& code': { fontSize: '0.8rem', wordBreak: 'break-all' } }}>
              <Typography variant="subtitle2" gutterBottom>
                Qanday link ishlatiladi?
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Tizim <strong>RTSP</strong> (<code>rtsp://...</code>) yoki brauzer orqali ochiladigan{' '}
                <strong>HTTP / HTTPS</strong> (<code>http://...</code>) oqimni qabul qiladi. Login/parolni ko‘pincha
                o‘ziga URL ichiga yozish kerak (quyidagi shablonlar).
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>rtsp.me/embed/...</strong> kabi sahifalar — bu veb-pleyer (HTML), server tahlil qila olmaydi;
                ular faqat kartochkada <strong>iframe</strong> orqali ko‘rinadi. Avtomatik yuz tahlili uchun{' '}
                <Link href="https://rtsp.me" target="_blank" rel="noopener noreferrer">
                  RTSP.ME
                </Link>{' '}
                kabinida berilgan haqiqiy <code>rtsp://</code> manzilni yoki kameraning to‘g‘ridan-to‘g‘ri oqimini
                kiriting.
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Stream URL bo‘sh qoldirilsa, avtomatik: <code>rtsp://{'{IP}'}:{'{port}'}/stream</code>
              </Typography>
              <Typography variant="caption" component="div" sx={{ fontWeight: 600, mt: 1 }}>
                Shablonlar (o‘z IP, login va parolingiz bilan almashtiring):
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  mt: 0.5,
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: '0.72rem',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {`RTSP — Hikvision / ko'p DVR:
rtsp://admin:SIZNING_PAROL@192.168.1.64:554/Streaming/Channels/101

RTSP — yana bir variant (sub-stream):
rtsp://admin:SIZNING_PAROL@192.168.1.64:554/Streaming/Channels/102

RTSP — umumiy (ishlamasa, kamera qo'llanmasidagi yo'lni qo'ying):
rtsp://admin:SIZNING_PAROL@192.168.1.64:554/h264/ch1/main/av_stream

HTTP — MJPEG (ba'zi IP-kameralar, port 80 yoki 8080):
http://192.168.1.64:8080/video.mjpg
http://admin:SIZNING_PAROL@192.168.1.64:80/videostream.cgi`}
              </Box>
            </Alert>
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <TextField name="name" label="Kamera nomi" fullWidth />
              <TextField name="ip_address" label="IP manzili" fullWidth required placeholder="192.168.1.64" />
              <TextField
                name="port"
                label="Port (veb / ONVIF uchun, RTSP odatda 554)"
                fullWidth
                defaultValue={80}
              />
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
              <TextField
                name="stream_url"
                label="Stream URL (ixtiyoriy — bo‘sh bo‘lsa RTSP shablon ishlatiladi)"
                fullWidth
                placeholder="rtsp://admin:parol@192.168.1.64:554/Streaming/Channels/101"
                helperText="Agar kamera RTSP yo‘lini bilsangiz, shu yerga to‘liq yozing. HTTP kamera bo‘lsa http://... ni yozing."
              />
              <TextField
                name="username"
                label="Foydalanuvchi (URL ichida bo‘lmasa, ba’zi integratsiyalar uchun)"
                fullWidth
              />
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
