import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
} from '@mui/material'
import { ArrowBack, AutoAwesome, Insights, Security } from '@mui/icons-material'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import apiClient from '../api/client'
import { asList } from '../utils/asList'

interface Location {
  id: number
  name: string
}

interface AnalyticsItem {
  id: number
  date: string
  real_customers: number
  reported_revenue: number
  estimated_revenue: number
  discrepancy: number
  discrepancy_percentage: number
}

interface RiskScore {
  id: number
  risk_score: number
  risk_level: string
  unregistered_employees?: number
  revenue_discrepancy?: number
  factors?: {
    unregistered_employees_count?: number
    potential_employees_count?: number
    revenue_ratio?: number
    discrepancy_percentage?: number
    [key: string]: number | undefined
  }
}

interface DistrictLocation {
  location_id: number
  location_name: string
  today_customers: number
  today_employees: number
  inside_total: number
  potential_employees: number
  risk_score: number
  risk_level: string
  tax_sync_status: string
}

interface CameraDowntime {
  id: number
  camera_name: string
  started_at: string
  ended_at?: string | null
  duration_minutes: number
  reason?: string
}

function Analytics() {
  const navigate = useNavigate()
  const params = useParams<{ locationId?: string }>()
  const [locationId, setLocationId] = useState<number | ''>(params.locationId ? Number(params.locationId) : '')
  useEffect(() => {
    setLocationId(params.locationId ? Number(params.locationId) : '')
  }, [params.locationId])

  const districtQuery = useQuery<{ locations: DistrictLocation[] }>('district-analytics', async () => (
    (await apiClient.get('dashboard/stats/')).data
  ), { refetchInterval: 15000 })

  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return asList<Location>(response.data)
  })

  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<AnalyticsItem[]>(
    ['analytics', locationId],
    async () => {
      const response = await apiClient.get('analytics/', {
        params: { location_id: locationId },
      })
      return asList<AnalyticsItem>(response.data)
    },
    { enabled: !!locationId }
  )

  const { data: riskScores = [], isLoading: risksLoading } = useQuery<RiskScore[]>(
    ['risk-scores', locationId],
    async () => {
      const response = await apiClient.get('risk-scores/', {
        params: { location_id: locationId },
      })
      return asList<RiskScore>(response.data)
    },
    { enabled: !!locationId }
  )

  const riskScore = riskScores[0]
  const latestAnalytics = analytics[0]
  const selectedDistrict = districtQuery.data?.locations.find((row) => row.location_id === Number(locationId))
  const aiJournal = useMemo(() => {
    if (!latestAnalytics) return []
    const entries = [
      { title: 'Kamera oqimi', text: `${latestAnalytics.real_customers || 0} ta mijoz tashrifi kamera orqali qayd etildi.`, color: 'primary.main' },
      { title: 'Kassa / soliq tushumi', text: latestAnalytics.reported_revenue > 0 ? `${Number(latestAnalytics.reported_revenue).toLocaleString()} so‘m rasmiy tushum qabul qilindi.` : 'Rasmiy tushum hali ulanmagan yoki ma’lumot kutilmoqda.', color: latestAnalytics.reported_revenue > 0 ? 'success.main' : 'warning.main' },
      { title: 'Tushum tahlili', text: latestAnalytics.reported_revenue > 0 ? 'Rasmiy tushum inspektor tomonidan kiritilgan. Kamera asosida pul summasi taxmin qilinmaydi.' : 'Rasmiy tushum kiritilmagan: AI tushum tahlili vaqtincha o‘chirilgan.', color: latestAnalytics.reported_revenue > 0 ? 'success.main' : 'warning.main' },
    ]
    const unregistered = riskScore?.factors?.unregistered_employees_count || 0
    const potential = riskScore?.factors?.potential_employees_count || 0
    if (unregistered || potential) entries.push({ title: 'Xodimlar tekshiruvi', text: `${unregistered} ta ro‘yxatdan o‘tmagan va ${potential} ta tekshiruvdagi ehtimoliy xodim aniqlandi.`, color: 'error.main' })
    return entries
  }, [latestAnalytics, riskScore])

  const chartData = useMemo(
    () =>
      [...analytics]
        .reverse()
        .map((item) => ({
          date: new Date(item.date).toLocaleDateString('uz-UZ'),
          real: item.real_customers,
          reported: Number(item.reported_revenue || 0),
          discrepancy: Number(item.discrepancy || 0),
        })),
    [analytics]
  )
  const downtimeQuery = useQuery<CameraDowntime[]>(
    ['camera-downtimes', locationId],
    async () => asList<CameraDowntime>((await apiClient.get('camera-downtimes/', { params: { location_id: locationId } })).data),
    { enabled: !!locationId, refetchInterval: 15000 }
  )

  const riskChartData = useMemo(() => {
    if (!riskScore) return []
    const factors = riskScore.factors || {}
    return [
      { name: 'Risk balli', qiymat: Number(riskScore.risk_score || 0) },
      { name: 'Ro‘yxatsiz xodim', qiymat: Number(factors.unregistered_employees_count || riskScore.unregistered_employees || 0) },
      { name: 'Ehtimoliy xodim', qiymat: Number(factors.potential_employees_count || 0) },
      { name: 'Mijozlar soni', qiymat: Number(factors.customer_count || 0) },
      { name: 'Xodimlar soni', qiymat: Number(factors.employee_count || 0) },
      { name: 'To‘langan soliq (ming)', qiymat: Number(factors.tax_paid || 0) / 1000 },
      { name: 'AI ssenariy tushumi (ming)', qiymat: Number(factors.scenario_turnover || 0) / 1000 },
      { name: 'AI ssenariy solig‘i (ming)', qiymat: Number(factors.scenario_tax || 0) / 1000 },
      { name: 'Soliq tafovuti (ming)', qiymat: Number(factors.scenario_tax_gap || 0) / 1000 },
      { name: 'Nofaol kameralar', qiymat: Number(factors.inactive_camera_count || 0) },
      { name: 'Kamera mavjudligi %', qiymat: Number(factors.camera_availability_percentage || 0) },
      { name: 'Tushum tafovuti %', qiymat: Number(factors.discrepancy_percentage || riskScore.revenue_discrepancy || 0) },
      { name: 'CRM–soliq tafovuti %', qiymat: Number(factors.crm_tax_revenue_gap_percentage || 0) },
      { name: 'CRM tushumi (ming)', qiymat: Number(factors.crm_revenue || 0) / 1000 },
    ]
  }, [riskScore])
  const activityChartData = useMemo(() => {
    const factors = riskScore?.factors || {}
    return [{
      davr: 'Bugun',
      mijozlar: Number(factors.customer_count || selectedDistrict?.today_customers || latestAnalytics?.real_customers || 0),
      xodimlar: Number(factors.employee_count || selectedDistrict?.today_employees || 0),
      ichkarida: Number(selectedDistrict?.inside_total || 0),
      soliq: Number(factors.tax_paid || 0) / 1000,
    }]
  }, [riskScore, selectedDistrict, latestAnalytics])

  if (locationsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Paper sx={{ p: { xs: 2.5, md: 3.5 }, mb: 3, color: '#fff', overflow: 'hidden', position: 'relative', background: 'linear-gradient(120deg, #0d2b52 0%, #1769e0 55%, #7249db 100%)', border: 0, boxShadow: '0 18px 45px rgba(23,105,224,.25)' }}>
        <Box sx={{ position: 'absolute', right: -40, top: -70, width: 220, height: 220, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.10)' }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <AutoAwesome sx={{ fontSize: 42 }} />
          <Box sx={{ flex: 1 }}><Typography variant="h4" sx={{ color: '#fff' }}>AI analitika markazi</Typography><Typography sx={{ color: 'rgba(255,255,255,.78)', mt: .5 }}>Kamera, xodim, mijoz va soliq ma’lumotlari bitta tushunarli grafik tizimda.</Typography></Box>
          <Chip icon={<Security />} label="AI nazorat faol" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.6)', bgcolor: 'rgba(255,255,255,.12)', fontWeight: 800 }} variant="outlined" />
        </Stack>
      </Paper>
      <Typography variant="h4" gutterBottom>Analitika va risklar</Typography>
      {!params.locationId && <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Asaka tumani — lokatsiyalar bo‘yicha risk</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Yuqori xavfli lokatsiyalar birinchi ko‘rsatiladi. Ma’lumotlar kamera, xodimlar va kiritilgan soliq hisobotlari asosida yangilanadi.</Typography>
        {districtQuery.isLoading ? <CircularProgress size={24} /> : <Table size="small"><TableHead><TableRow><TableCell>Lokatsiya</TableCell><TableCell>Risk</TableCell><TableCell>Bugungi mijoz</TableCell><TableCell>Ichkarida</TableCell><TableCell>Ehtimoliy xodim</TableCell><TableCell>Soliq ma’lumoti</TableCell></TableRow></TableHead><TableBody>{[...(districtQuery.data?.locations || [])].sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0)).map((row) => <TableRow key={row.location_id} hover onClick={() => { setLocationId(row.location_id); navigate(`/analytics/${row.location_id}`) }} sx={{ cursor: 'pointer' }}><TableCell><b>{row.location_name}</b></TableCell><TableCell><Chip size="small" label={`${row.risk_level.toUpperCase()} · ${Number(row.risk_score || 0).toFixed(1)}`} color={row.risk_level === 'critical' || row.risk_level === 'high' ? 'error' : row.risk_level === 'medium' ? 'warning' : 'success'} /></TableCell><TableCell>{row.today_customers}</TableCell><TableCell>{row.inside_total}</TableCell><TableCell>{row.potential_employees}</TableCell><TableCell>{row.tax_sync_status === 'success' ? 'Kiritilgan' : 'Kiritilmagan'}</TableCell></TableRow>)}</TableBody></Table>}
      </Paper>}
      {params.locationId && <Button startIcon={<ArrowBack />} onClick={() => navigate('/analytics')} sx={{ mb: 2 }}>Risk ro‘yxatiga qaytish</Button>}
      <FormControl fullWidth sx={{ mt: 3, mb: 3, maxWidth: 320 }}>
        <InputLabel id="location-select-label">Lokatsiyani tanlang</InputLabel>
        <Select
          labelId="location-select-label"
          value={locationId}
          label="Lokatsiyani tanlang"
          onChange={(e) => setLocationId(e.target.value as number)}
        >
          {locations.map((loc) => (
            <MenuItem key={loc.id} value={loc.id}>
              {loc.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!locationId && <Alert severity="info">Analitikani ko'rish uchun lokatsiyani tanlang.</Alert>}

      {locationId && (analyticsLoading || risksLoading) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {locationId && riskScore && (
        <Paper sx={{ p: 3, mb: 3, borderTop: 4, borderColor: riskScore.risk_level === 'critical' || riskScore.risk_level === 'high' ? 'error.main' : 'success.main', background: riskScore.risk_level === 'critical' || riskScore.risk_level === 'high' ? 'linear-gradient(135deg, rgba(239,68,68,.10), rgba(255,255,255,.98))' : 'linear-gradient(135deg, rgba(46,125,50,.10), rgba(255,255,255,.98))' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}><Box><Typography variant="h6">AI risk xulosasi</Typography><Typography variant="body2" color="text.secondary">Kamera oqimi, xodim holati va soliq/kassa tushumi asosida avtomatik yangilanadi.</Typography></Box><Chip label={riskScore.risk_level.toUpperCase()} color={riskScore.risk_level === 'critical' || riskScore.risk_level === 'high' ? 'error' : riskScore.risk_level === 'medium' ? 'warning' : 'success'} /></Box>
          <Typography variant="h3" color={riskScore.risk_level === 'critical' || riskScore.risk_level === 'high' ? 'error.main' : 'success.main'}>{Number(riskScore.risk_score || 0).toFixed(1)} / 100</Typography>
          <Grid container spacing={1.5} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={4}><Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">To‘langan soliq</Typography><Typography variant="h6">{Number(riskScore.factors?.tax_paid || 0).toLocaleString()} so‘m</Typography></Paper></Grid>
            <Grid item xs={12} sm={4}><Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Hisoblangan nazorat solig‘i</Typography><Typography variant="h6">{Number(riskScore.factors?.scenario_tax || 0).toLocaleString()} so‘m</Typography></Paper></Grid>
            <Grid item xs={12} sm={4}><Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Soliq tafovuti</Typography><Typography variant="h6" color={Number(riskScore.factors?.scenario_tax_gap || 0) > 0 ? 'error.main' : 'success.main'}>{Number(riskScore.factors?.scenario_tax_gap || 0).toLocaleString()} so‘m</Typography></Paper></Grid>
          </Grid>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1.5}>{aiJournal.map((item) => <Box key={item.title} sx={{ borderLeft: 4, borderColor: item.color, pl: 1.5 }}><Typography fontWeight={700}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.text}</Typography></Box>)}</Stack>
        </Paper>
      )}

      {locationId && <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Kamera nofaol bo‘lgan vaqtlar</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Qaysi kamera qaysi kuni va qancha vaqt nofaol bo‘lganini ko‘rsatadi.</Typography>
        {!downtimeQuery.data?.length ? <Typography color="text.secondary">Nofaol holat bo‘yicha hali qayd yo‘q.</Typography> : <Table size="small"><TableHead><TableRow><TableCell>Kamera</TableCell><TableCell>Boshlangan vaqt</TableCell><TableCell>Tugagan vaqt</TableCell><TableCell>Davomiyligi</TableCell><TableCell>Sabab</TableCell></TableRow></TableHead><TableBody>{downtimeQuery.data.map((item) => <TableRow key={item.id}><TableCell>{item.camera_name}</TableCell><TableCell>{new Date(item.started_at).toLocaleString('uz-UZ', { hour12: false })}</TableCell><TableCell>{item.ended_at ? new Date(item.ended_at).toLocaleString('uz-UZ', { hour12: false }) : 'Hozir ham nofaol'}</TableCell><TableCell>{(Number(item.duration_minutes || 0) / 60).toFixed(1)} soat</TableCell><TableCell>{item.reason || '—'}</TableCell></TableRow>)}</TableBody></Table>}
      </Paper>}

      {locationId && riskScore && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Tanlangan lokatsiya — to‘liq risk tahlili</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>CRM zakazlari va soliqchi kiritgan tushum ham risk hisobiga kiritiladi. Soliq ma’lumoti kiritilmasa, bu band tekshirilmagan sifatida qoladi.</Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={riskChartData} layout="vertical" margin={{ left: 25, right: 25 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 'auto']} />
              <YAxis type="category" dataKey="name" width={150} />
              <Tooltip formatter={(value: number) => [Number(value).toFixed(1), 'Qiymat']} />
              <Legend />
              <Bar dataKey="qiymat" name="AI ko‘rsatkichi" fill="#e53935" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {latestAnalytics && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Davr: {new Date(latestAnalytics.date).toLocaleDateString('uz-UZ')} · Mijozlar: {latestAnalytics.real_customers} · Rasmiy tushum: {Number(latestAnalytics.reported_revenue || 0).toLocaleString()} so‘m · Tafovut: {Number(latestAnalytics.discrepancy_percentage || 0).toFixed(1)}%</Typography>}
          {selectedDistrict && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Bugungi to‘liq qayd: {selectedDistrict.today_customers} ta mijoz · {selectedDistrict.today_employees} ta xodim · ichkarida {selectedDistrict.inside_total} ta · ehtimoliy xodim {selectedDistrict.potential_employees} ta.</Typography>}
        </Paper>
      )}

      {locationId && !riskScore && !risksLoading && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Tanlangan lokatsiya uchun risk ma'lumoti topilmadi.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderTop: 3, borderColor: 'primary.main' }}>
            <Typography variant="h6" gutterBottom>
              <Insights sx={{ verticalAlign: 'middle', mr: 1, color: 'primary.main' }} /> Mijozlar, xodimlar va tushum tahlili
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="real" stroke="#8884d8" name="Real mijozlar" />
                <Line type="monotone" dataKey="reported" stroke="#82ca9d" name="Hisobot tushumi" />
                <Line type="monotone" dataKey="discrepancy" stroke="#ff7300" name="Tafovut" />
              </LineChart>
            </ResponsiveContainer>
            {locationId && <ResponsiveContainer width="100%" height={280}>
              <BarChart data={activityChartData} margin={{ top: 20, right: 25, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="davr" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="mijozlar" name="Kamera mijozlari" fill="#1976d2" />
                <Bar dataKey="xodimlar" name="Kamera xodimlari" fill="#2e7d32" />
                <Bar dataKey="ichkarida" name="Hozir ichkarida" fill="#ed6c02" />
                <Bar dataKey="soliq" name="To‘langan soliq (ming so‘m)" fill="#7b1fa2" />
              </BarChart>
            </ResponsiveContainer>}
          </Paper>
        </Grid>
      </Grid>
      <Paper component="footer" sx={{ mt: 3, p: 2, bgcolor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary">
          AI izohi: “AI ssenariy tushumi” kamera qayd etgan mijozlar soni × sozlanadigan o‘rtacha chek (hozir 40 000 so‘m) asosida faqat taqqoslash uchun hisoblanadi. “AI ssenariy solig‘i” shu ssenariy tushumining 12% namunaviy stavkasidir. Bu rasmiy soliq hisoboti yoki qaror emas: haqiqiy stavka faoliyat turi va soliq rejimiga bog‘liq. Riskda asosiy dalil — kamera mijoz/xodim soni va soliqchi kiritgan to‘langan summa; yakuniy tekshiruvni soliq inspektori qiladi.
        </Typography>
      </Paper>
    </Box>
  )
}

export default Analytics
