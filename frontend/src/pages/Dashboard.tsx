import React, { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Stack,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Chip,
} from '@mui/material'
import { LocationOn, OpenInNew, People, TrendingUp, Warning, AutoAwesome } from '@mui/icons-material'
import apiClient from '../api/client'
import { asList } from '../utils/asList'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import GoogleMapPicker from '../components/GoogleMapPicker'

interface Location {
  id: number
  name?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
}

interface Employee {
  id: number
}

interface RiskScore {
  id: number
  risk_level: string
}

interface AnalyticsItem {
  id: number
  date: string
  real_customers: number
  estimated_revenue: number
  reported_revenue: number
}

interface VisitorSummary {
  today_customers: number
  today_employees: number
  inside_total: number
  inside_employees: number
  long_stay_today: number
  potential_employees: number
  updated_at?: string
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

interface VisitorRow { id: number; visitor_id: string; location_name?: string; employee_name?: string; is_employee: boolean; status: string; entered_at: string; exited_at?: string | null; stay_duration?: number | null }

interface DistrictLocationStats {
  location_id: number
  location_name: string
  today_customers: number
  today_employees: number
  inside_total: number
  employees: number
  estimated_revenue: number
  reported_revenue: number
  risk_score: number
  risk_level: string
  tax_sync_status: string
}

interface DistrictStats {
  district_name: string
  totals: {
    locations: number
    today_customers: number
    today_employees: number
    inside_total: number
    employees: number
    estimated_revenue: number
    reported_revenue: number
    risk_locations: number
    potential_employees: number
    total_orders: number
    total_order_revenue: number
    average_order: number
    total_tax_paid: number
    estimated_tax_due: number
    tax_gap: number
  }
  locations: DistrictLocationStats[]
  period?: { start_date: string; end_date: string }
  period_analytics?: Array<{
    date: string
    real_customers: number
    reported_revenue: number
    estimated_revenue: number
    discrepancy: number
  }>
}

const fallbackChartData = [
  { name: 'Dush', customers: 0, revenue: 0 },
  { name: 'Sesh', customers: 0, revenue: 0 },
  { name: 'Chor', customers: 0, revenue: 0 },
  { name: 'Pay', customers: 0, revenue: 0 },
  { name: 'Juma', customers: 0, revenue: 0 },
  { name: 'Shan', customers: 0, revenue: 0 },
  { name: 'Yak', customers: 0, revenue: 0 },
]

function Dashboard() {
  const previousMonth = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  }, [])
  const monthValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const [periodStart, setPeriodStart] = useState(monthValue(previousMonth))
  const [periodEnd, setPeriodEnd] = useState(monthValue(previousMonth))
  const [visitorDialog, setVisitorDialog] = useState<'customers' | 'employees' | 'inside' | 'long_stay' | null>(null)
  const locationsQuery = useQuery<unknown>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const employeesQuery = useQuery<unknown>('employees', async () => {
    const response = await apiClient.get('employees/')
    return response.data
  })

  const riskScoresQuery = useQuery<unknown>('risk-scores', async () => {
    const response = await apiClient.get('risk-scores/')
    return response.data
  })

  const analyticsQuery = useQuery<unknown>('analytics', async () => {
    const response = await apiClient.get('analytics/')
    return response.data
  })

  const visitorSummaryQuery = useQuery<VisitorSummary>('visitor-dashboard-summary', async () => {
    const response = await apiClient.get('visitor-sessions/summary/')
    return response.data
  }, { refetchInterval: 5000 })

  const districtStatsQuery = useQuery<DistrictStats>(['asaka-district-dashboard', periodStart, periodEnd], async () => {
    const lastDay = new Date(Number(periodEnd.slice(0, 4)), Number(periodEnd.slice(5, 7)), 0).getDate()
    const response = await apiClient.get('dashboard/stats/', {
      params: { start_date: `${periodStart}-01`, end_date: `${periodEnd}-${String(lastDay).padStart(2, '0')}` },
    })
    return response.data
  }, { refetchInterval: 5 * 60 * 1000 })
  const visitorRowsQuery = useQuery<VisitorRow[]>(['dashboard-visitor-list', visitorDialog], async () => {
    const params: Record<string, number> = {}
    if (visitorDialog === 'customers') params.today = 1
    if (visitorDialog === 'employees') { params.today = 1; params.employee = 1 }
    if (visitorDialog === 'long_stay') { params.today = 1; params.long_stay = 1 }
    if (visitorDialog === 'inside') { params.employee = 1 }
    const endpoint = visitorDialog === 'inside' ? 'visitor-sessions/inside/' : 'visitor-sessions/'
    return (await apiClient.get(endpoint, { params })).data
  }, { enabled: Boolean(visitorDialog) })

  const locations = asList<Location>(locationsQuery.data)
  const employees = asList<Employee>(employeesQuery.data)
  const riskScores = asList<RiskScore>(riskScoresQuery.data)
  const analytics = asList<AnalyticsItem>(analyticsQuery.data)

  const summary = useMemo(
    () => ({
      totalLocations: districtStatsQuery.data?.totals.locations ?? locations.length,
      totalEmployees: districtStatsQuery.data?.totals.employees ?? employees.length,
      riskLocations: districtStatsQuery.data?.totals.risk_locations ?? riskScores.filter((item) => ['high', 'critical'].includes(item.risk_level)).length,
      revenue: districtStatsQuery.data?.totals.reported_revenue ?? analytics.reduce(
        (sum, item) => sum + Number(item.reported_revenue || 0),
        0
      ),
      todayCustomers: districtStatsQuery.data?.totals.today_customers ?? visitorSummaryQuery.data?.today_customers ?? 0,
      insideTotal: districtStatsQuery.data?.totals.inside_total ?? visitorSummaryQuery.data?.inside_total ?? 0,
      potentialEmployees: districtStatsQuery.data?.totals.potential_employees ?? visitorSummaryQuery.data?.potential_employees ?? 0,
      todayEmployees: districtStatsQuery.data?.totals.today_employees ?? visitorSummaryQuery.data?.today_employees ?? 0,
      insideEmployees: visitorSummaryQuery.data?.inside_employees ?? 0,
      longStay: visitorSummaryQuery.data?.long_stay_today ?? 0,
      totalOrders: districtStatsQuery.data?.totals.total_orders ?? 0,
      totalOrderRevenue: districtStatsQuery.data?.totals.total_order_revenue ?? 0,
      averageOrder: districtStatsQuery.data?.totals.average_order ?? 0,
      totalTaxPaid: districtStatsQuery.data?.totals.total_tax_paid ?? 0,
      estimatedTaxDue: districtStatsQuery.data?.totals.estimated_tax_due ?? 0,
      taxGap: districtStatsQuery.data?.totals.tax_gap ?? 0,
    }),
    [analytics, districtStatsQuery.data, employees, locations, riskScores, visitorSummaryQuery.data]
  )

  const periodAnalytics = districtStatsQuery.data?.period_analytics ?? []
  const periodCustomers = periodAnalytics.reduce((sum, item) => sum + Number(item.real_customers || 0), 0)
  const periodRevenue = periodAnalytics.reduce((sum, item) => sum + Number(item.reported_revenue || 0), 0)
  const periodEstimatedRevenue = periodAnalytics.reduce((sum, item) => sum + Number(item.estimated_revenue || 0), 0)
  const periodDiscrepancy = periodAnalytics.reduce((sum, item) => sum + Number(item.discrepancy || 0), 0)

  const chartData = useMemo(() => {
    const source = periodAnalytics.length ? periodAnalytics : [...analytics].slice(0, 7).reverse()
    const latestAnalytics = source.map((item) => {
        const d = item?.date ? new Date(item.date) : null
        const name =
          d && !Number.isNaN(d.getTime())
            ? d.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : '—'
        return {
          name,
          customers: item.real_customers,
          revenue: Number(item.reported_revenue || 0),
        }
      })

    return latestAnalytics.length ? latestAnalytics : fallbackChartData
  }, [analytics, periodAnalytics])

  const locationMarkers = useMemo(
    () =>
      locations
        .filter((item) => typeof item.latitude === 'number' && typeof item.longitude === 'number')
        .map((item) => ({
          id: item.id,
          lat: item.latitude ?? null,
          lng: item.longitude ?? null,
          title: item.name || `Lokatsiya #${item.id}`,
          description: item.address || '',
        })),
    [locations]
  )

  const isLoading =
    locationsQuery.isLoading ||
    employeesQuery.isLoading ||
    riskScoresQuery.isLoading ||
    analyticsQuery.isLoading

  const openMapWindow = () => {
    window.open('/locations-map', 'all-locations-map', 'width=1450,height=900,resizable=yes,scrollbars=yes')
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 0.5 }}>
        <Typography variant="h4">Asaka tumani — umumiy dashboard</Typography>
        <Chip icon={<AutoAwesome />} label="AI tahlil markazi" color="primary" variant="outlined" sx={{ fontWeight: 800, letterSpacing: 0.3 }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Jonli holat har 5 soniyada yangilanadi · barcha ruxsat etilgan lokatsiyalar birlashtirilgan. Oxirgi yangilanish: {formatDateTime(visitorSummaryQuery.data?.updated_at)}
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Typography fontWeight={700}>Umumiy davr analitikasi</Typography>
          <TextField
            size="small"
            type="month"
            label="Boshlanish oyi"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="month"
            label="Tugash oyi"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="body2" color="text.secondary">
            Barcha lokatsiyalar · {periodStart} — {periodEnd}
          </Typography>
        </Stack>
      </Paper>
      {(locationsQuery.isError ||
        employeesQuery.isError ||
        riskScoresQuery.isError ||
        analyticsQuery.isError) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Ba’zi ma’lumotlar yuklanmadi. Sahifa qolgan qismlar bilan ishlaydi; tafsilotlar uchun brauzer
          tarmoq jadvalini tekshiring.
        </Alert>
      )}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Tanlangan davr bo‘yicha jami</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}><Typography variant="body2" color="text.secondary">Mijozlar</Typography><Typography variant="h5">{periodCustomers.toLocaleString()}</Typography></Grid>
              <Grid item xs={12} sm={6} md={3}><Typography variant="body2" color="text.secondary">Rasmiy tushum</Typography><Typography variant="h5">{periodRevenue.toLocaleString()} so‘m</Typography></Grid>
              <Grid item xs={12} sm={6} md={3}><Typography variant="body2" color="text.secondary">Hisoblangan tushum</Typography><Typography variant="h5">{periodEstimatedRevenue.toLocaleString()} so‘m</Typography></Grid>
              <Grid item xs={12} sm={6} md={3}><Typography variant="body2" color="text.secondary">Tafovut</Typography><Typography variant="h5" color={periodDiscrepancy > 0 ? 'error.main' : 'success.main'}>{periodDiscrepancy.toLocaleString()} so‘m</Typography></Grid>
            </Grid>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <LocationOn color="primary" sx={{ fontSize: 40, mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Lokatsiyalar
                  </Typography>
                  <Typography variant="h4">{summary.totalLocations}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Jami buyurtmalar</Typography><Typography variant="h4">{summary.totalOrders.toLocaleString()}</Typography><Typography variant="caption" color="text.secondary">CRM bo‘yicha to‘langan</Typography></CardContent></Card></Grid>
        <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Jami CRM daromad</Typography><Typography variant="h4">{summary.totalOrderRevenue.toLocaleString()} so‘m</Typography><Typography variant="caption" color="text.secondary">Barcha lokatsiyalar</Typography></CardContent></Card></Grid>
        <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">O‘rtacha zakaz</Typography><Typography variant="h4">{summary.averageOrder.toLocaleString()} so‘m</Typography><Typography variant="caption" color="text.secondary">To‘langan zakazlar</Typography></CardContent></Card></Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card onClick={() => setVisitorDialog('customers')} sx={{ cursor: 'pointer' }}><CardContent><Typography color="textSecondary">Bugungi mijozlar</Typography><Typography variant="h4">{summary.todayCustomers}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card onClick={() => setVisitorDialog('employees')} sx={{ cursor: 'pointer' }}><CardContent><Typography color="textSecondary">Bugungi xodimlar</Typography><Typography variant="h4">{summary.todayEmployees}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card onClick={() => setVisitorDialog('inside')} sx={{ cursor: 'pointer' }}><CardContent><Typography color="textSecondary">Hozir ishlayotgan xodimlar</Typography><Typography variant="h4">{summary.insideEmployees}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card onClick={() => setVisitorDialog('long_stay')} sx={{ cursor: 'pointer' }}><CardContent><Typography color="textSecondary">3 soatdan ko‘p qolganlar</Typography><Typography variant="h4" color="warning.main">{summary.longStay}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <People color="primary" sx={{ fontSize: 40, mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Xodimlar
                  </Typography>
                  <Typography variant="h4">{summary.totalEmployees}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Warning color="error" sx={{ fontSize: 40, mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Riskli lokatsiyalar
                  </Typography>
                  <Typography variant="h4">{summary.riskLocations}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TrendingUp color="success" sx={{ fontSize: 40, mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Rasmiy tushum
                  </Typography>
                  <Typography variant="h4">{summary.revenue.toLocaleString()} so'm</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Oxirgi analitika
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="customers" stroke="#8884d8" name="Mijozlar" />
                <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Tushum" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Lokatsiyalar kesimi</Typography>
            <Stack spacing={1.25}>
              {(districtStatsQuery.data?.locations ?? []).map((location) => (
                <Box key={location.location_id} sx={{ borderLeft: 4, borderColor: location.tax_sync_status === 'missing' ? 'error.main' : location.risk_level === 'critical' || location.risk_level === 'high' ? 'error.main' : 'primary.main', bgcolor: location.tax_sync_status === 'missing' ? 'error.50' : 'grey.50', px: 1.5, py: 1 }}>
                  <Typography fontWeight={700}>{location.location_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Bugun: {location.today_customers} mijoz · {location.today_employees} xodim · ichkarida {location.inside_total}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {location.tax_sync_status === 'missing' ? 'Soliq ma’lumoti kiritilmagan — AI tushum tahlili o‘chirilgan' : `Risk: ${location.risk_score.toFixed(1)} (${location.risk_level}) · Soliq ma’lumoti kiritilgan`}
                  </Typography>
                </Box>
              ))}
              {!districtStatsQuery.data?.locations.length && <Typography color="text.secondary">Lokatsiya ma’lumotlari hali mavjud emas.</Typography>}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <Dialog open={Boolean(visitorDialog)} onClose={() => setVisitorDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{visitorDialog === 'customers' ? 'Bugungi mijozlar' : visitorDialog === 'employees' ? 'Bugungi xodimlar' : visitorDialog === 'inside' ? 'Hozir ishlayotgan xodimlar' : '3 soatdan ko‘p qolganlar'}</DialogTitle>
        <DialogContent dividers><Table size="small"><TableHead><TableRow><TableCell>ID / F.I.Sh.</TableCell><TableCell>Lokatsiya</TableCell><TableCell>Kirish</TableCell><TableCell>Chiqish</TableCell><TableCell>Holat</TableCell></TableRow></TableHead><TableBody>
          {visitorRowsQuery.isLoading ? <TableRow><TableCell colSpan={5}>Yuklanmoqda...</TableCell></TableRow> : (visitorRowsQuery.data ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.employee_name || row.visitor_id}</TableCell><TableCell>{row.location_name || '—'}</TableCell><TableCell>{formatDateTime(row.entered_at)}</TableCell><TableCell>{row.exited_at ? formatDateTime(row.exited_at) : 'Hozir ichkarida'}</TableCell><TableCell>{row.status === 'inside' ? 'Ichkarida' : 'Chiqdi'}</TableCell></TableRow>)}
          {!visitorRowsQuery.isLoading && !(visitorRowsQuery.data ?? []).length && <TableRow><TableCell colSpan={5}>Ma’lumot yo‘q.</TableCell></TableRow>}
        </TableBody></Table></DialogContent><DialogActions><Button onClick={() => setVisitorDialog(null)}>Yopish</Button></DialogActions>
      </Dialog>
    </Box>
  )
}

export default Dashboard
