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
  IconButton,
  InputLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
} from '@mui/material'
import { Videocam, Edit, Delete, Replay, ExitToApp, Hub } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import { asList } from '../utils/asList'
import { useAuthStore } from '../store/authStore'
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

interface CameraItem {
  id: number
  name: string
  ip_address: string
  port: number
  stream_url?: string
  camera_type: string
  camera_type_display?: string
  location: number
  location_name?: string
  is_active: boolean
  username?: string
}

interface GatewayItem {
  id: number
  location: number
  location_name?: string
  name: string
  host: string
  channel_count: number
  vpn_connected: boolean
  status: 'online' | 'offline' | 'warning'
  notes?: string
}

interface EmployeeItem {
  id: number
  location: number
  location_name?: string
  full_name: string
  position?: string | null
  phone?: string | null
  is_registered: boolean
  is_active: boolean
  latest_image_path?: string | null
  monitoring_id?: string | null
}

interface VisitorSummary {
  today_customers: number
  today_employees: number
  inside_customers: number
  inside_employees: number
  inside_total: number
  long_stay_today: number
  unclosed_previous_days?: number
  by_location?: LocationStats[]
}

interface LocationStats {
  location_id: number
  location_name: string
  today_customers: number
  today_employees: number
  inside_customers: number
  inside_employees: number
  inside_total: number
  long_stay_today: number
  unclosed_previous_days?: number
}

interface VisitorSessionItem {
  id: number
  visitor_id: string
  location: number
  entered_at: string
  exited_at?: string | null
  stay_duration?: number | null
  today_stay_duration?: number | null
  current_stay_duration?: number | null
  is_anonymous?: boolean
  is_employee: boolean
  employee?: number | null
  employee_name?: string | null
  employee_monitoring_id?: string | null
  status: string
  location_name?: string
  entry_camera_name?: string
  exit_camera_name?: string
  entry_image_path?: string
  exit_image_path?: string
  entry_body_image_path?: string
  exit_body_image_path?: string
  events?: Array<{ id: number; event_type: string; occurred_at: string; image_path?: string; is_manual?: boolean; camera_name?: string }>
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

const formatStay = (minutes?: number | null) => {
  const total = Math.max(0, Math.round(minutes ?? 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  return hours ? `${hours} soat ${mins} daqiqa` : `${mins} daqiqa`
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = date.toLocaleDateString('uz-UZ', { day: 'numeric' })
  const month = date.toLocaleDateString('uz-UZ', { month: '2-digit' })
  const year = date.toLocaleDateString('uz-UZ', { year: 'numeric' })
  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day}.${month}.${year} ${time}`
}

const currentLocalDateTimeInput = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}

const mediaUrl = (path?: string | null) => path ? `/media/${String(path).replace(/^\/+/, '')}` : undefined

function Cameras() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canManageCameras = Boolean((user as any)?.is_superuser)
  const canManageRetention = Boolean((user as any)?.is_superuser)
  const [open, setOpen] = useState(false)
  const [formLocationId, setFormLocationId] = useState<string>('')
  const [visitorsOpen, setVisitorsOpen] = useState(false)
  const [visitorListType, setVisitorListType] = useState<'customer' | 'employee' | 'long_stay' | 'inside_customer' | 'inside_employee' | 'inside_total' | 'unclosed_previous_days'>('customer')
  const [visitorLocationId, setVisitorLocationId] = useState<string>('')
  const [employeeRosterLocationId, setEmployeeRosterLocationId] = useState<number | null>(null)
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorSessionItem | null>(null)
  const [employeeDetails, setEmployeeDetails] = useState({ full_name: '', position: 'Xodim', phone: '', jshshir: '' })
  const [retentionOpen, setRetentionOpen] = useState(false)
  const [retentionHours, setRetentionHours] = useState(24)
  const [mergeTarget, setMergeTarget] = useState<VisitorSessionItem | null>(null)
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [manualCheckoutVisitor, setManualCheckoutVisitor] = useState<VisitorSessionItem | null>(null)
  const [manualCheckoutAt, setManualCheckoutAt] = useState('')

  const camerasQuery = useQuery('cameras', async () => {
    const response = await apiClient.get('cameras/')
    return response.data
  })

  const locationsQuery = useQuery<unknown>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })
  const cameraHealthQuery = useQuery<any[]>('camera-health', async () => (await apiClient.get('cameras/health/')).data, { refetchInterval: 15000 })
  const gatewaysQuery = useQuery<GatewayItem[]>('nvr-gateways', async () => (await apiClient.get('nvr-gateways/')).data)

  const retentionQuery = useQuery<{ retention_hours: number }>('visitor-retention', async () => {
    const response = await apiClient.get('visitor-retention/')
    return response.data
  }, { onSuccess: (data) => setRetentionHours(data.retention_hours) })

  const visitorSummaryQuery = useQuery<VisitorSummary>(
    'visitor-summary',
    async () => {
      const response = await apiClient.get('visitor-sessions/summary/')
      return response.data
    },
    { refetchInterval: 3000 }
  )

  const todayVisitorsQuery = useQuery<VisitorSessionItem[]>(
    ['today-visitors', visitorListType, visitorLocationId],
    async () => {
      const isInside = visitorListType.startsWith('inside_') || visitorListType === 'unclosed_previous_days'
      const response = await apiClient.get(isInside ? 'visitor-sessions/inside/' : 'visitor-sessions/', {
        params: {
          ...(isInside ? {} : { today: 1 }),
          ...(visitorListType === 'customer' || visitorListType === 'inside_customer' ? { customer: 1 } : {}),
          ...(visitorListType === 'employee' ? { employee: 1 } : {}),
          ...(visitorListType === 'inside_employee' ? { employee: 1 } : {}),
          ...(visitorListType === 'long_stay' ? { long_stay: 1 } : {}),
          ...(visitorListType === 'unclosed_previous_days' ? { unclosed_previous_days: 1 } : {}),
          ...(visitorLocationId ? { location_id: visitorLocationId } : {}),
        },
      })
      return asList<VisitorSessionItem>(response.data)
    },
    { enabled: visitorsOpen, refetchInterval: visitorsOpen ? 3000 : false }
  )

  // Bu so'rov faqat davomat kartasi uchun: xodim bugun kamera tomonidan
  // kamida bir marta ko'rilganmi, shuni har 3 soniyada yangilab turadi.
  const employeeAttendanceQuery = useQuery<VisitorSessionItem[]>(
    'today-employee-attendance',
    async () => asList<VisitorSessionItem>((await apiClient.get('visitor-sessions/', { params: { today: 1, employee: 1 } })).data),
    { refetchInterval: 3000 }
  )

  const employeesQuery = useQuery<unknown>(
    'employees',
    async () => {
      const response = await apiClient.get('employees/')
      return response.data
    },
    { refetchInterval: 15000 }
  )

  const cameras = asList<any>(camerasQuery.data)
  const orderedCameras = [...cameras].sort((a, b) => {
    const order: Record<string, number> = { entrance: 0, exit: 1 }
    return (order[a.camera_type] ?? 2) - (order[b.camera_type] ?? 2)
  })
  const cameraGroups = useMemo(() => {
    const groups = new Map<number, { id: number; name: string; cameras: any[] }>()
    orderedCameras.forEach((camera) => {
      const id = Number(camera.location)
      const current: { id: number; name: string; cameras: any[] } = groups.get(id) || {
        id, name: camera.location_name || `Lokatsiya #${id}`, cameras: [],
      }
      current.cameras.push(camera)
      groups.set(id, current)
    })
    return [...groups.values()]
  }, [orderedCameras])
  const visitorGroups = useMemo(() => {
    const groups = new Map<string, VisitorSessionItem[]>()
    ;(todayVisitorsQuery.data ?? []).forEach((visitor) => {
      const locationName = visitor.location_name || 'Noma’lum lokatsiya'
      groups.set(locationName, [...(groups.get(locationName) ?? []), visitor])
    })
    return [...groups.entries()]
  }, [todayVisitorsQuery.data])
  const locations = asList<LocationOption>(locationsQuery.data)
  const gateways = asList<GatewayItem>(gatewaysQuery.data)
  const employees = asList<EmployeeItem>(employeesQuery.data)
  const employeeAttendanceById = useMemo(() => {
    const result = new Map<number, VisitorSessionItem>()
    ;(employeeAttendanceQuery.data ?? []).forEach((session) => {
      if (!session.employee) return
      const previous = result.get(session.employee)
      if (!previous || new Date(session.entered_at).getTime() > new Date(previous.entered_at).getTime()) {
        result.set(session.employee, session)
      }
    })
    return result
  }, [employeeAttendanceQuery.data])
  const employeeWorkSummaryById = useMemo(() => {
    const summaries = new Map<number, { firstEntry?: string; lastExit?: string; totalMinutes: number; isInside: boolean }>()
    const now = Date.now()
    ;(employeeAttendanceQuery.data ?? []).forEach((session) => {
      if (!session.employee) return
      const current = summaries.get(session.employee) || { totalMinutes: 0, isInside: false }
      const orderedEvents = [...(session.events ?? [])].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
      const entries = orderedEvents.filter((event) => event.event_type === 'entry')
      const exits = orderedEvents.filter((event) => event.event_type === 'exit')
      const firstEntry = entries[0]?.occurred_at || session.entered_at
      const lastExit = exits.length ? exits[exits.length - 1].occurred_at : session.exited_at || undefined
      if (!current.firstEntry || new Date(firstEntry).getTime() < new Date(current.firstEntry).getTime()) current.firstEntry = firstEntry
      if (lastExit && (!current.lastExit || new Date(lastExit).getTime() > new Date(current.lastExit).getTime())) current.lastExit = lastExit

      if (entries.length) {
        entries.forEach((entry, index) => {
          const exit = exits[index]
          const end = exit ? new Date(exit.occurred_at).getTime() : (session.status === 'inside' ? now : new Date(entry.occurred_at).getTime())
          current.totalMinutes += Math.max(0, (end - new Date(entry.occurred_at).getTime()) / 60000)
        })
      } else if (typeof session.stay_duration === 'number') {
        current.totalMinutes += session.stay_duration
      } else if (session.status === 'inside') {
        current.totalMinutes += Math.max(0, (now - new Date(session.entered_at).getTime()) / 60000)
      }
      current.isInside = current.isInside || session.status === 'inside'
      summaries.set(session.employee, current)
    })
    return summaries
  }, [employeeAttendanceQuery.data])
  const rosterLocation = employeeRosterLocationId === null ? null : locations.find((location) => location.id === employeeRosterLocationId)
  const rosterEmployees = employeeRosterLocationId === null
    ? []
    : employees.filter((employee) => Number(employee.location) === employeeRosterLocationId && employee.is_active)
  const isLoading = camerasQuery.isLoading
  const isError = camerasQuery.isError
  const isEmployeesLoading = employeesQuery.isLoading


  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({ full_name: '', phone: '', position: '' })

  const [editingCamera, setEditingCamera] = useState<CameraItem | null>(null)
  const [editCameraOpen, setEditCameraOpen] = useState(false)
  const [editCameraForm, setEditCameraForm] = useState({
    name: '',
    stream_url: '',
    camera_type: 'entrance',
    port: 80,
    is_active: true,
    location: 0,
  })
  const [gatewayOpen, setGatewayOpen] = useState(false)
  const [editingGateway, setEditingGateway] = useState<GatewayItem | null>(null)
  const [gatewayForm, setGatewayForm] = useState({ location: 0, name: '', host: '', channel_count: 4, vpn_connected: false, status: 'offline', notes: '' })

  const editEmployeeMutation = useMutation(
    (payload: { id: number; data: Partial<EmployeeItem> }) => apiClient.patch(`employees/${payload.id}/`, payload.data),
    {
      onSuccess: () => {
        toast.success('Xodim yangilandi')
        queryClient.invalidateQueries('employees')
        setEditDialogOpen(false)
        setEditingEmployee(null)
      },
      onError: (error) => {
        toast.error(extractErrorMessage(error))
      },
    }
  )

  const editCameraMutation = useMutation(
    (payload: { id: number; data: Partial<CameraItem> }) =>
      apiClient.patch(`cameras/${payload.id}/`, payload.data),
    {
      onSuccess: () => {
        toast.success("Kamera ma'lumotlari yangilandi")
        queryClient.invalidateQueries('cameras')
        setEditCameraOpen(false)
        setEditingCamera(null)
      },
      onError: (error) => {
        toast.error(extractErrorMessage(error))
      },
    }
  )

  const saveCameraEdit = () => {
    if (!editingCamera) return
    editCameraMutation.mutate({ id: editingCamera.id, data: editCameraForm })
  }

  const saveGatewayMutation = useMutation(
    (payload: typeof gatewayForm) => editingGateway
      ? apiClient.put(`nvr-gateways/${editingGateway.id}/`, payload)
      : apiClient.post('nvr-gateways/', payload),
    {
      onSuccess: () => {
        toast.success(editingGateway ? 'NVR ulanishi yangilandi' : 'NVR ulanishi saqlandi')
        queryClient.invalidateQueries('nvr-gateways')
        setGatewayOpen(false)
        setEditingGateway(null)
      },
      onError: (error) => { toast.error(extractErrorMessage(error)) },
    }
  )
  const deleteGatewayMutation = useMutation(
    (gatewayId: number) => apiClient.delete(`nvr-gateways/${gatewayId}/`),
    {
      onSuccess: () => {
        toast.success('NVR ulanishi o‘chirildi')
        queryClient.invalidateQueries('nvr-gateways')
        setGatewayOpen(false)
        setEditingGateway(null)
      },
      onError: (error) => { toast.error(extractErrorMessage(error)) },
    }
  )
  const openGatewayDialog = (gateway?: GatewayItem, locationId?: number) => {
    setEditingGateway(gateway || null)
    setGatewayForm(gateway
      ? { location: gateway.location, name: gateway.name, host: gateway.host, channel_count: gateway.channel_count, vpn_connected: gateway.vpn_connected, status: gateway.status, notes: gateway.notes || '' }
      : { location: locationId || 0, name: '', host: '', channel_count: 4, vpn_connected: false, status: 'offline', notes: '' })
    setGatewayOpen(true)
  }

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

  const registerVisitorMutation = useMutation(
    (payload: { id: number; full_name: string; position: string; phone: string; jshshir: string }) => apiClient.post(`visitor-sessions/${payload.id}/register-employee/`, payload),
    {
      onSuccess: () => {
        toast.success("Xodim yuz ma'lumoti bilan ro'yxatdan o'tkazildi")
        setSelectedVisitor(null)
        setEmployeeDetails({ full_name: '', position: 'Xodim', phone: '', jshshir: '' })
        queryClient.invalidateQueries('employees')
        queryClient.invalidateQueries('today-visitors')
      },
      onError: (error) => {
        toast.error(extractErrorMessage(error))
      },
    }
  )

  const returnEmployeeMutation = useMutation(
    (employeeId: number) => apiClient.post(`employees/${employeeId}/return-to-customer/`),
    {
      onSuccess: () => {
        toast.success('Xodim biriktirishi bekor qilindi — keyingi tahlilda mijoz bo‘ladi')
        queryClient.invalidateQueries('employees')
        queryClient.invalidateQueries('today-visitors')
        queryClient.invalidateQueries('visitor-summary')
      },
      onError: (error) => { toast.error(extractErrorMessage(error)) },
    }
  )
  const mergeVisitorsMutation = useMutation(
    ({ targetId, sourceId }: { targetId: number; sourceId: number }) => apiClient.post(`visitor-sessions/${targetId}/merge/`, { source_id: sourceId }),
    { onSuccess: () => { toast.success('Ikki ID bitta tashrifga birlashtirildi'); setMergeTarget(null); setMergeSourceId(''); queryClient.invalidateQueries('today-visitors'); queryClient.invalidateQueries('visitor-summary') }, onError: (error) => { toast.error(extractErrorMessage(error)) } }
  )
  const manualCheckoutMutation = useMutation(
    (payload: { visitorId: number; exitedAt?: string }) => apiClient.post(`visitor-sessions/${payload.visitorId}/manual-checkout/`, payload.exitedAt ? { exited_at: payload.exitedAt } : {}),
    {
      onSuccess: () => {
        toast.success('Tashrif qo‘lda chiqdi deb belgilandi')
        setManualCheckoutVisitor(null)
        setManualCheckoutAt('')
        queryClient.invalidateQueries('today-visitors')
        queryClient.invalidateQueries('visitor-summary')
        queryClient.invalidateQueries('camera-health')
        queryClient.invalidateQueries('today-employee-attendance')
      },
      onError: (error) => { toast.error(extractErrorMessage(error)) },
    }
  )

  const openManualCheckout = (visitor: VisitorSessionItem) => {
    setManualCheckoutVisitor(visitor)
    setManualCheckoutAt(currentLocalDateTimeInput())
  }

  const retentionMutation = useMutation(
    () => apiClient.post('visitor-retention/', { retention_hours: retentionHours }),
    {
      onSuccess: () => {
        toast.success("Mijoz ma'lumotlari saqlash muddati yangilandi")
        queryClient.invalidateQueries('visitor-retention')
        setRetentionOpen(false)
      },
      onError: (error) => {
        toast.error(extractErrorMessage(error))
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
      camera_type: (raw.camera_type as string) || 'entrance',
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

  const renderCameraCard = (camera: any) => (
    <Card sx={{ height: '100%' }}>
      <CameraStream cameraId={camera.id} streamUrl={camera.stream_url || `rtsp://${camera.ip_address}:${camera.port}/stream`} isActive={Boolean(camera.is_active && (camera.stream_url || camera.ip_address))} locationId={camera.location || null} />
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Videocam sx={{ fontSize: 40, mr: 2 }} />
          <Box><Typography variant="h6">{camera.name || camera.ip_address}</Typography><Typography variant="body2" color="text.secondary">{camera.ip_address}</Typography><Typography variant="body2" color="text.secondary">{camera.camera_type_display || camera.camera_type}</Typography></Box>
        </Box>
        <Chip label={camera.is_active ? 'Ulangan' : 'Ulanmagan'} color={camera.is_active ? 'success' : 'default'} size="small" />
        {(() => {
          const health = (cameraHealthQuery.data || []).find((item: any) => item.camera_id === camera.id)
          return <Typography variant="caption" display="block" color={health?.status === 'online' ? 'success.main' : 'text.secondary'} sx={{ mt: 1 }}>
            AI holati: {health?.status === 'online' ? 'ONLINE' : 'OFFLINE'} · oxirgi tahlil: {health?.last_analysis ? formatDateTime(health.last_analysis) : 'hali tahlil qaydi yo‘q'}
          </Typography>
        })()}
        {canManageCameras && <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
          <IconButton size="small" color="primary" onClick={() => { setEditingCamera(camera as CameraItem); setEditCameraForm({ name: camera.name || '', stream_url: camera.stream_url || '', camera_type: camera.camera_type || 'entrance', port: camera.port || 80, is_active: Boolean(camera.is_active), location: Number(camera.location) }); setEditCameraOpen(true) }}><Edit /></IconButton>
          <IconButton size="small" color="error" disabled={deleteCameraMutation.isLoading} onClick={() => { if (window.confirm('Bu kamerani o‘chirishni xohlaysizmi?')) deleteCameraMutation.mutate(camera.id) }}><Delete /></IconButton>
        </Box>}
      </CardContent>
    </Card>
  )

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
            Kirish va chiqish kameralarining umumiy jonli kuzatuvi.
          </Typography>
        </Box>

        {canManageCameras && <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {canManageRetention && <Button variant="outlined" onClick={() => setRetentionOpen(true)}>
            Mijoz saqlash muddati
          </Button>}
          <Button
            variant="outlined"
            color="secondary"
            disabled={connectMutation.isLoading}
            onClick={() => {
              if (locations.length === 0) {
                toast.error("Avval location qo'shing")
                return
              }
              const webcamCount = cameras.filter((camera) => /^\d+$/.test(String(camera.stream_url || '').trim())).length
              connectMutation.mutate({
                name: `Demo Webcam ${webcamCount + 1}`,
                ip_address: '127.0.0.1',
                port: 0,
                stream_url: '0',
                camera_type: 'entrance',
                location: locations[0].id,
              })
            }}
          >
            Webcam Demo
          </Button>
          <Button variant="contained" onClick={() => setOpen(true)}>
            Yangi kamera ulash
          </Button>
          <Button variant="outlined" startIcon={<Hub />} onClick={() => openGatewayDialog()}>
            NVR ulanishi
          </Button>
        </Box>}
      </Box>
      {cameras.length === 0 ? (
        <Alert severity="warning">Hozircha kamera qo‘shilmagan.</Alert>
      ) : (
        <Box sx={{ mt: 1 }}>
          {cameraGroups.map((group) => {
            const stats = visitorSummaryQuery.data?.by_location?.find((item) => item.location_id === group.id)
            const locationEmployees = employees.filter((employee) => Number(employee.location) === group.id && employee.is_active)
            const arrivedEmployees = locationEmployees.filter((employee) => employeeAttendanceById.has(employee.id))
            return <Paper key={group.id} sx={{ p: 2, mb: 3, borderTop: '3px solid #1976d2' }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6">{group.name}</Typography>
                {(() => {
                  const gateway = gateways.find((item) => item.location === group.id)
                  if (gateway) return <Chip icon={<Hub />} size="small" color={gateway.status === 'online' ? 'success' : gateway.status === 'warning' ? 'warning' : 'default'} label={`NVR: ${gateway.name} · ${gateway.host}`} onClick={canManageCameras ? () => openGatewayDialog(gateway) : undefined} />
                  return canManageCameras ? <Button size="small" startIcon={<Hub />} onClick={() => openGatewayDialog(undefined, group.id)}>NVR ulash</Button> : null
                })()}
              </Box>
              <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: '#f7fbff', border: '1px solid #d7e9ff' }}>
              <Typography variant="h6" gutterBottom>Jonli tashrif hisobi</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                Kirish va chiqish kameralari fon rejimida har 2 soniyada tahlil qilinadi.
              </Typography>
              <Grid container spacing={1.2}>
                {[
                  ['Bugungi mijozlar', stats?.today_customers ?? 0, '#1976d2', 'customer'],
                  ['Bugungi xodimlar', stats?.today_employees ?? 0, '#7b1fa2', 'employee'],
                  ['Hozir ichkarida mijoz', stats?.inside_customers ?? 0, '#ed6c02', 'inside_customer'],
                  ['Hozir ichkarida xodim', stats?.inside_employees ?? 0, '#2e7d32', 'inside_employee'],
                  ['Jami ichkarida', stats?.inside_total ?? 0, '#263238', 'inside_total'],
                  ['3 soatdan ko‘p', stats?.long_stay_today ?? 0, '#d32f2f', 'long_stay'],
                  ['Chiqishi noma’lum', stats?.unclosed_previous_days ?? 0, '#c62828', 'unclosed_previous_days'],
                ].map(([label, value, color, listType]) => {
                  const colorValue = String(color)
                  const canOpenList = Boolean(listType)
                  return (
                  <Grid item xs={6} key={String(label)}>
                    <Box
                      onClick={() => {
                        if (canOpenList) {
                          setVisitorListType(listType as typeof visitorListType)
                          setVisitorLocationId(String(group.id))
                          setVisitorsOpen(true)
                        }
                      }}
                      sx={{ p: 1.2, borderRadius: 1, bgcolor: 'white', borderLeft: `4px solid ${colorValue}`, cursor: canOpenList ? 'pointer' : 'default' }}
                    >
                      <Typography variant="h5" sx={{ color: colorValue, fontWeight: 700 }}>{value}</Typography>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                    </Box>
                  </Grid>
                  )
                })}
                <Grid item xs={12}>
                  <Box
                    onClick={() => setEmployeeRosterLocationId(group.id)}
                    sx={{ p: 1.2, borderRadius: 1, bgcolor: '#fffde7', borderLeft: '4px solid #f9a825', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ color: '#a66c00', fontWeight: 800 }}>{locationEmployees.length}</Typography>
                      <Typography variant="caption" color="text.secondary">Jami xodimlar</Typography>
                    </Box>
                    <Chip size="small" color={arrivedEmployees.length === locationEmployees.length && locationEmployees.length ? 'success' : 'warning'} label={`Keldi: ${arrivedEmployees.length} / ${locationEmployees.length}`} />
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700, mb: 1 }}>Kirish kameralari</Typography>
            <Grid container spacing={2}>
              {group.cameras.filter((camera) => camera.camera_type === 'entrance').map((camera: any, index: number) => <Grid item xs={12} key={camera.id}><Typography variant="caption">Kirish {index + 1}</Typography>{renderCameraCard(camera)}</Grid>)}
            </Grid>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1" color="secondary" sx={{ fontWeight: 700, mb: 1 }}>Chiqish kameralari</Typography>
            <Grid container spacing={2}>
              {group.cameras.filter((camera) => camera.camera_type === 'exit').map((camera: any, index: number) => <Grid item xs={12} key={camera.id}><Typography variant="caption">Chiqish {index + 1}</Typography>{renderCameraCard(camera)}</Grid>)}
            </Grid>
          </Grid>
              </Grid>
            </Paper>
          })}
        </Box>
      )}

      {/* <Paper sx={{ mt: 3, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Barcha xodimlar
        </Typography>
        {isEmployeesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : employees.length === 0 ? (
          <Alert severity="warning">Xodim topilmadi.</Alert>
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
      </Paper> */}

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

      {/* Kamera tahrirlash dialogi */}
      <Dialog open={editCameraOpen} onClose={() => setEditCameraOpen(false)} fullWidth maxWidth="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveCameraEdit()
          }}
        >
          <DialogTitle>Kamerani tahrirlash</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <TextField
                label="Kamera nomi"
                value={editCameraForm.name}
                onChange={(e) => setEditCameraForm((p) => ({ ...p, name: e.target.value }))}
                fullWidth
                required
              />
              <TextField
                label="Stream URL"
                value={editCameraForm.stream_url}
                onChange={(e) => setEditCameraForm((p) => ({ ...p, stream_url: e.target.value }))}
                fullWidth
                placeholder="rtsp://admin:parol@192.168.1.64:554/..."
                helperText="Webcam raqami: 0 — birinchi, 1 — ikkinchi qurilma. Test uchun bir xil raqamni bir nechta kameraga berish mumkin. RTSP/HTTP manzil ham qabul qilinadi."
              />
              <TextField
                label="Port"
                type="number"
                value={editCameraForm.port}
                onChange={(e) => setEditCameraForm((p) => ({ ...p, port: Number(e.target.value) }))}
                fullWidth
              />
              <TextField
                label="Kamera turi"
                select
                value={editCameraForm.camera_type}
                onChange={(e) => setEditCameraForm((p) => ({ ...p, camera_type: e.target.value }))}
                fullWidth
                SelectProps={{ native: true }}
              >
                <option value="entrance">Kirish</option>
                <option value="exit">Chiqish</option>
              </TextField>
              <TextField
                label="Lokatsiya"
                select
                value={editCameraForm.location}
                onChange={(e) => setEditCameraForm((p) => ({ ...p, location: Number(e.target.value) }))}
                fullWidth
                SelectProps={{ native: true }}
              >
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </TextField>
              <FormControl fullWidth>
                <InputLabel>Holat</InputLabel>
                <Select
                  label="Holat"
                  value={editCameraForm.is_active ? 'true' : 'false'}
                  onChange={(e) =>
                    setEditCameraForm((p) => ({ ...p, is_active: e.target.value === 'true' }))
                  }
                >
                  <MenuItem value="true">Faol</MenuItem>
                  <MenuItem value="false">Nofaol</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditCameraOpen(false)} color="inherit">
              Bekor qilish
            </Button>
            <Button type="submit" variant="contained" disabled={editCameraMutation.isLoading}>
              {editCameraMutation.isLoading ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={gatewayOpen} onClose={() => { setGatewayOpen(false); setEditingGateway(null) }} fullWidth maxWidth="sm">
        <form onSubmit={(event) => { event.preventDefault(); saveGatewayMutation.mutate(gatewayForm) }}>
          <DialogTitle>{editingGateway ? 'NVR ulanishini tahrirlash' : 'NVR / router ulanishini qo‘shish'}</DialogTitle>
          <DialogContent dividers>
            <Alert severity="info" sx={{ mb: 2 }}>Bu kamera emas. Bu lokatsiyadagi NVR yoki VPN-router manzili. Kameralarni esa shu sahifadagi “Yangi kamera ulash” tugmasidan qo‘shasiz.</Alert>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField select required label="Lokatsiya" value={gatewayForm.location || ''} onChange={(event) => setGatewayForm((old) => ({ ...old, location: Number(event.target.value) }))}>
                {locations.filter((location) => editingGateway?.location === location.id || !gateways.some((item) => item.location === location.id)).map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
              </TextField>
              <TextField required label="NVR nomi" value={gatewayForm.name} onChange={(event) => setGatewayForm((old) => ({ ...old, name: event.target.value }))} placeholder="Masalan: Asaka-1 NVR" />
              <TextField required label="VPN IP yoki NVR manzili" value={gatewayForm.host} onChange={(event) => setGatewayForm((old) => ({ ...old, host: event.target.value }))} placeholder="10.8.0.12" helperText="Ochiq internet IP emas, VPN ichidagi manzil yoziladi." />
              <TextField required type="number" inputProps={{ min: 1, max: 256 }} label="Kamera kanallari" value={gatewayForm.channel_count} onChange={(event) => setGatewayForm((old) => ({ ...old, channel_count: Number(event.target.value) }))} />
              <TextField select label="Ulanish holati" value={gatewayForm.status} onChange={(event) => setGatewayForm((old) => ({ ...old, status: event.target.value as 'online' | 'offline' | 'warning' }))}>
                <MenuItem value="online">Online</MenuItem><MenuItem value="warning">Ogohlantirish</MenuItem><MenuItem value="offline">Offline</MenuItem>
              </TextField>
              <FormControlLabel control={<Switch checked={gatewayForm.vpn_connected} onChange={(event) => setGatewayForm((old) => ({ ...old, vpn_connected: event.target.checked }))} />} label="VPN / himoyalangan tunnel ulangan" />
              <TextField multiline minRows={2} label="Izoh" value={gatewayForm.notes} onChange={(event) => setGatewayForm((old) => ({ ...old, notes: event.target.value }))} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            {editingGateway && <Button color="error" disabled={deleteGatewayMutation.isLoading} onClick={() => { if (window.confirm('NVR ulanish yozuvini o‘chirasizmi?')) deleteGatewayMutation.mutate(editingGateway.id) }}>O‘chirish</Button>}
            <Box sx={{ flex: 1 }} /><Button onClick={() => { setGatewayOpen(false); setEditingGateway(null) }} color="inherit">Bekor qilish</Button><Button type="submit" variant="contained" disabled={saveGatewayMutation.isLoading}>{saveGatewayMutation.isLoading ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
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
                defaultValue="entrance"
                SelectProps={{ native: true }}
              >
                <option value="entrance">Kirish</option>
                <option value="exit">Chiqish</option>
              </TextField>
              <TextField
                name="stream_url"
                label="Stream URL (ixtiyoriy — bo‘sh bo‘lsa RTSP shablon ishlatiladi)"
                fullWidth
                placeholder="rtsp://admin:parol@192.168.1.64:554/Streaming/Channels/101"
                helperText="Test webcam: 0 — birinchi, 1 — ikkinchi qurilma (bir xil raqamni bir nechta demo kameraga berish mumkin). Tarmoq kamera uchun to‘liq RTSP yoki HTTP manzilini yozing."
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
      <Dialog open={visitorsOpen} onClose={() => setVisitorsOpen(false)} fullWidth maxWidth="xl">
        <DialogTitle>
          {visitorListType === 'employee' ? 'Bugungi xodimlar' : visitorListType === 'long_stay' ? '3 soatdan ko‘p qolganlar' : visitorListType === 'inside_customer' ? 'Hozir ichkaridagi mijozlar' : visitorListType === 'inside_employee' ? 'Hozir ichkaridagi xodimlar' : visitorListType === 'inside_total' ? 'Hozir ichkaridagilar' : visitorListType === 'unclosed_previous_days' ? 'Oldingi kundan chiqishi noma’lumlar' : 'Bugungi mijozlar'} — {locations.find((location) => String(location.id) === visitorLocationId)?.name || 'lokatsiya'}
        </DialogTitle>
        <DialogContent dividers>
          {(todayVisitorsQuery.data ?? []).length === 0 ? (
            <Typography color="text.secondary">Bugun hali tashrif qayd etilmagan.</Typography>
          ) : (
            <Box sx={{ overflowX: 'auto', maxHeight: '70vh' }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1120, tableLayout: 'fixed', border: '1px solid', borderColor: 'divider', '& td, & th': { borderRight: '1px solid', borderColor: 'divider', textAlign: 'center', verticalAlign: 'middle' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 150, bgcolor: '#e3f2fd', fontWeight: 700 }}>ID / F.I.Sh. / lokatsiya</TableCell>
                  <TableCell sx={{ width: 130, bgcolor: '#e8f5e9', fontWeight: 700 }}>Kirish rasmi</TableCell>
                  <TableCell sx={{ width: 170, bgcolor: '#e8f5e9', fontWeight: 700 }}>Kirish vaqti</TableCell>
                  <TableCell sx={{ width: 130, bgcolor: '#fff3e0', fontWeight: 700 }}>Chiqish rasmi</TableCell>
                  <TableCell sx={{ width: 170, bgcolor: '#fff3e0', fontWeight: 700 }}>Chiqish vaqti</TableCell>
                  <TableCell sx={{ width: 130, bgcolor: '#f3e5f5', fontWeight: 700 }}>Davomiyligi</TableCell>
                  <TableCell sx={{ width: 100, bgcolor: '#f5f5f5', fontWeight: 700 }} align="center">Amal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visitorGroups.map(([locationName, visitors]) => (
                  <React.Fragment key={locationName}>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ bgcolor: 'primary.50', py: 1.25, textAlign: 'left !important' }}>
                        <Typography fontWeight={700}>{locationName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {visitors.length} ta {visitorListType === 'employee' || visitorListType === 'inside_employee' ? 'xodim' : visitorListType === 'inside_total' ? 'odam' : visitorListType === 'long_stay' ? 'uzoq qolgan mijoz' : 'mijoz'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {visitors.map((visitor) => {
                  const entries = visitor.events?.filter((event) => event.event_type === 'entry') ?? []
                  const exits = visitor.events?.filter((event) => event.event_type === 'exit') ?? []
                  const entryImages = entries.length ? entries : [{ id: 0, occurred_at: visitor.entered_at, image_path: visitor.is_anonymous ? (visitor.entry_body_image_path || visitor.entry_image_path || '') : (visitor.entry_image_path || '') }]
                  const exitImages = exits.length ? exits : (visitor.is_anonymous ? (visitor.exit_body_image_path || visitor.exit_image_path) : visitor.exit_image_path) ? [{ id: 0, occurred_at: visitor.exited_at || '', image_path: visitor.is_anonymous ? (visitor.exit_body_image_path || visitor.exit_image_path) : visitor.exit_image_path, is_manual: false }] : []
                  // Har kirishga o'zining chiqishi to'g'ri keladi. Ikkinchi
                  // tashrif ochiq bo'lsa, birinchi chiqish uni yashirmasin.
                  const alignedExits = entryImages.map((_, index) => exitImages[index] || null)
                  const gridItemSx = { minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 }, py: .5 }
                  return (
                    <TableRow key={visitor.id} hover sx={{ bgcolor: visitor.is_anonymous ? 'rgba(211,47,47,.09)' : undefined, '&:nth-of-type(even)': { bgcolor: visitor.is_anonymous ? 'rgba(211,47,47,.12)' : '#fafafa' } }}>
                      <TableCell sx={{ textAlign: 'center' }}>
                        {visitor.is_anonymous ? <Chip label="ANONIM" size="small" color="error" sx={{ fontWeight: 800, mb: .5 }} /> : <b>{visitor.is_employee ? (visitor.employee_monitoring_id || visitor.visitor_id) : visitor.visitor_id}</b>}<br />
                        <Typography variant="caption" color="text.secondary">Tizim ID: {visitor.id}</Typography><br />
                        {visitor.is_anonymous && <Typography variant="caption" color="error.main">Yuz aniqlanmadi, tashqi ko‘rinishdan odam topildi</Typography>}
                        {visitor.is_employee && visitor.employee_name && <Typography variant="body2" color="primary.main">{visitor.employee_name}</Typography>}
                        <Typography variant="caption">{visitor.location_name || '—'}</Typography>
                        <Box sx={{ mt: 1 }}><Chip size="small" color={visitor.status === 'inside' ? 'warning' : 'success'} label={visitor.status === 'inside' ? 'Hozir ichkarida' : 'Chiqdi'} /></Box>
                        {canManageCameras && visitor.status === 'inside' && <Button
                          variant="outlined" color="warning" size="small" startIcon={<ExitToApp />}
                          sx={{ mt: 1 }} onClick={() => openManualCheckout(visitor)}
                        >Qo‘lda chiqdi</Button>}
                      </TableCell>
                      <TableCell sx={{ p: .5 }}>{entryImages.map((event, index) => <Box key={`${event.id}-${index}`} sx={gridItemSx}>{event.image_path ? <Box component="img" src={`/media/${event.image_path}`} alt="Kirish rasmi" sx={{ width: 104, height: 82, objectFit: 'cover', borderRadius: 1 }} /> : <Typography variant="caption">Rasm yo‘q</Typography>}</Box>)}</TableCell>
                      <TableCell sx={{ p: .5 }}>{entryImages.map((event, index) => <Box key={`${event.id}-${index}`} sx={gridItemSx}><Typography variant="body2" sx={{ lineHeight: 1.45 }}>{formatDateTime(event.occurred_at)}</Typography></Box>)}</TableCell>
                      <TableCell sx={{ p: .5 }}>{alignedExits.map((event, index) => <Box key={index} sx={gridItemSx}>{event?.is_manual ? <Box sx={{ textAlign: 'center' }}><Chip label="ADMIN BELGILADI" size="small" color="warning" /><Typography variant="caption" display="block" sx={{ mt: .5 }}>Chiqish rasmi yo‘q</Typography></Box> : event?.image_path ? <Box component="img" src={`/media/${event.image_path}`} alt="Chiqish rasmi" sx={{ width: 104, height: 82, objectFit: 'cover', borderRadius: 1 }} /> : <Typography variant="caption">{event ? 'Rasm yo‘q' : visitor.status === 'inside' && index === entryImages.length - 1 ? 'Hali chiqmagan' : 'Chiqish rasmi yo‘q'}</Typography>}</Box>)}</TableCell>
                      <TableCell sx={{ p: .5 }}>{alignedExits.map((event, index) => <Box key={index} sx={gridItemSx}>{event ? <Box sx={{ textAlign: 'center' }}><Typography variant="body2" sx={{ lineHeight: 1.45 }}>{formatDateTime(event.occurred_at)}</Typography>{event.is_manual && <Typography variant="caption" color="warning.dark">Admin tomonidan qo‘lda belgilandi</Typography>}</Box> : visitor.status === 'inside' && index === entryImages.length - 1 ? <Chip label="Hozir ichkarida" size="small" color="warning" /> : <Typography variant="caption">Chiqish qaydi yo‘q</Typography>}</Box>)}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}><b>{formatStay(Number(visitor.today_stay_duration ?? visitor.stay_duration ?? 0))}</b><br /><Typography variant="caption">{entries.length || 1} ta tashrif · bugungi vaqt</Typography></TableCell>
                      <TableCell align="center">
                        {canManageCameras && visitor.status === 'inside' && <IconButton color="warning" aria-label="Qo‘lda chiqdi deb belgilash" title="Kamera chiqishni ko‘rmagan: chiqish sana-vaqtini qo‘lda belgilash" onClick={() => openManualCheckout(visitor)}><ExitToApp /></IconButton>}
                        {!visitor.is_employee ? <IconButton color="primary" title="Xodimlar ro‘yxatiga qo‘shish" onClick={() => {
                          setEmployeeDetails({ full_name: '', position: 'Xodim', phone: '', jshshir: '' })
                          setSelectedVisitor(visitor)
                        }}><Edit /></IconButton> : (
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: .5 }}>
                            <Chip label="Xodim" size="small" color="success" />
                            {canManageCameras && visitor.employee && <IconButton color="warning" title="Xodim biriktirishini bekor qilib, mijozga qaytarish" onClick={() => {
                              if (window.confirm('Bu odam xodim sifatidan chiqariladi va keyingi kamera tahlilida oddiy mijoz bo‘ladi. Davom etasizmi?')) returnEmployeeMutation.mutate(visitor.employee!)
                            }}><Replay /></IconButton>}
                          </Box>
                        )}
                        {canManageCameras && <IconButton color="secondary" title="Boshqa ID bilan birlashtirish" onClick={() => { setMergeTarget(visitor); setMergeSourceId('') }}><Replay /></IconButton>}
                      </TableCell>
                    </TableRow>
                  )
                    })}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
            </Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setVisitorsOpen(false)}>Yopish</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(manualCheckoutVisitor)} onClose={() => setManualCheckoutVisitor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Kamera ko‘rmagan chiqishni belgilash</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {manualCheckoutVisitor?.visitor_id} uchun kamera chiqishni qayd etmadi. Haqiqiy chiqish sana-vaqtini kiriting — jadvalda `ADMIN BELGILADI` deb saqlanadi.
          </Typography>
          <TextField
            autoFocus fullWidth type="datetime-local" label="Chiqish sana-vaqti" value={manualCheckoutAt}
            onChange={(event) => setManualCheckoutAt(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualCheckoutVisitor(null)}>Bekor qilish</Button>
          <Button variant="contained" color="warning" disabled={manualCheckoutMutation.isLoading || !manualCheckoutAt} onClick={() => manualCheckoutVisitor && manualCheckoutMutation.mutate({ visitorId: manualCheckoutVisitor.id, exitedAt: new Date(manualCheckoutAt).toISOString() })}>Chiqdi deb belgilash</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={employeeRosterLocationId !== null} onClose={() => setEmployeeRosterLocationId(null)} fullWidth maxWidth="md">
        <DialogTitle>{rosterLocation?.name || 'Lokatsiya'} — Jami xodimlar davomati</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Bu ro‘yxat faqat shu lokatsiyaga biriktirilgan xodimlardan tuziladi. Kamera xodim yuzini taniganda holat avtomatik yangilanadi.
          </Typography>
          {isEmployeesLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={26} /></Box> : rosterEmployees.length === 0 ? (
            <Alert severity="info">Bu lokatsiyaga xodim biriktirilmagan.</Alert>
          ) : (
            <Table size="small" sx={{ minWidth: 700, border: '1px solid', borderColor: 'divider', '& td, & th': { borderBottom: '1px solid', borderColor: 'divider', textAlign: 'center', verticalAlign: 'middle' } }}>
              <TableHead><TableRow sx={{ bgcolor: '#f7fbff' }}><TableCell>Rasm</TableCell><TableCell>F.I.Sh. / kamera ID</TableCell><TableCell>Lavozimi</TableCell><TableCell>Bugungi holati</TableCell><TableCell>Birinchi kelgan vaqti</TableCell><TableCell>Oxirgi ketgan vaqti</TableCell><TableCell>Jami ishlagan vaqti</TableCell></TableRow></TableHead>
              <TableBody>{rosterEmployees.map((employee) => {
                const attendance = employeeAttendanceById.get(employee.id)
                const workSummary = employeeWorkSummaryById.get(employee.id)
                return <TableRow key={employee.id} hover>
                  <TableCell>{mediaUrl(employee.latest_image_path) ? <Box component="img" src={mediaUrl(employee.latest_image_path)} alt={employee.full_name} sx={{ width: 76, height: 64, objectFit: 'cover', objectPosition: 'center top', borderRadius: 1 }} /> : <Typography variant="caption">Rasm yo‘q</Typography>}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{employee.full_name}{employee.monitoring_id && <Typography variant="caption" display="block" color="text.secondary">ID: {employee.monitoring_id}</Typography>}</TableCell>
                  <TableCell>{employee.position || 'Xodim'}</TableCell>
                  <TableCell align="center"><Chip size="small" color={attendance ? 'success' : 'default'} label={attendance ? 'Keldi' : 'Kelmagan'} /></TableCell>
                  <TableCell align="center">{workSummary?.firstEntry ? formatDateTime(workSummary.firstEntry) : '—'}</TableCell>
                  <TableCell align="center">{workSummary?.isInside ? <Chip size="small" color="warning" label="Hozir ichkarida" /> : workSummary?.lastExit ? formatDateTime(workSummary.lastExit) : '—'}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800 }}>{workSummary ? formatStay(workSummary.totalMinutes) : '—'}</TableCell>
                </TableRow>
              })}</TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setEmployeeRosterLocationId(null)}>Yopish</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(selectedVisitor)} onClose={() => setSelectedVisitor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Xodimni ro‘yxatdan o‘tkazish</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Visitor ID: {selectedVisitor?.visitor_id}. Ushbu tashrifdagi yuz xodim profiliga doimiy biriktiriladi.</Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField autoFocus fullWidth required label="Ism-familiya" value={employeeDetails.full_name} onChange={(event) => setEmployeeDetails({ ...employeeDetails, full_name: event.target.value })} />
            <TextField fullWidth label="Lavozimi" value={employeeDetails.position} onChange={(event) => setEmployeeDetails({ ...employeeDetails, position: event.target.value })} />
            <TextField fullWidth label="Telefon" value={employeeDetails.phone} onChange={(event) => setEmployeeDetails({ ...employeeDetails, phone: event.target.value })} />
            <TextField fullWidth required label="JSHSHIR (14 raqam)" inputProps={{ maxLength: 14, inputMode: 'numeric' }} value={employeeDetails.jshshir} onChange={(event) => setEmployeeDetails({ ...employeeDetails, jshshir: event.target.value.replace(/\D/g, '').slice(0, 14) })} helperText={`${employeeDetails.jshshir.length}/14`} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedVisitor(null)}>Bekor qilish</Button>
          <Button variant="contained" disabled={!employeeDetails.full_name.trim() || !/^\d{14}$/.test(employeeDetails.jshshir) || registerVisitorMutation.isLoading} onClick={() => selectedVisitor && registerVisitorMutation.mutate({ id: selectedVisitor.id, full_name: employeeDetails.full_name.trim(), position: employeeDetails.position.trim() || 'Xodim', phone: employeeDetails.phone.trim(), jshshir: employeeDetails.jshshir })}>Saqlash</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(mergeTarget)} onClose={() => setMergeTarget(null)} fullWidth maxWidth="xs"><DialogTitle>AI IDlarni birlashtirish</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Asosiy ID: <b>{mergeTarget?.visitor_id}</b>. Shu odamning boshqa vaqtinchalik ID raqamini kiriting. Rasmlar va kirish-chiqish qaydlari bitta kartaga yig‘iladi.</Typography><TextField autoFocus fullWidth label="Birlashtiriladigan tashrif ID" value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)} helperText="Jadvaldagi ichki raqam (ID ustunidagi raqam)" /></DialogContent><DialogActions><Button onClick={() => setMergeTarget(null)}>Bekor qilish</Button><Button variant="contained" disabled={!Number(mergeSourceId) || mergeVisitorsMutation.isLoading} onClick={() => mergeTarget && mergeVisitorsMutation.mutate({ targetId: mergeTarget.id, sourceId: Number(mergeSourceId) })}>Birlashtirish</Button></DialogActions></Dialog>
      <Dialog open={retentionOpen} onClose={() => setRetentionOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Mijoz ma’lumotlarini saqlash</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Xodimga biriktirilgan rasm va yuz ma’lumoti doimiy saqlanadi. Bu sozlama faqat mijoz yozuvlariga taalluqli.
          </Typography>
          <TextField select fullWidth label="Saqlash muddati" value={retentionHours} onChange={(event) => setRetentionHours(Number(event.target.value))}>
            <MenuItem value={24}>24 soat</MenuItem>
            <MenuItem value={24 * 7}>7 kun</MenuItem>
            <MenuItem value={24 * 10}>10 kun</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetentionOpen(false)}>Bekor qilish</Button>
          <Button variant="contained" onClick={() => retentionMutation.mutate()} disabled={retentionMutation.isLoading || retentionQuery.isLoading}>Saqlash</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Cameras
