import React, { useMemo } from 'react'
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
} from '@mui/material'
import { LocationOn, OpenInNew, People, TrendingUp, Warning } from '@mui/icons-material'
import apiClient from '../api/client'
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
  const { data: locations = [], isLoading: locationsLoading, isError: locationsError } = useQuery<Location[]>(
    'locations',
    async () => {
      const response = await apiClient.get('locations/')
      return response.data
    }
  )

  const { data: employees = [], isLoading: employeesLoading, isError: employeesError } = useQuery<Employee[]>(
    'employees',
    async () => {
      const response = await apiClient.get('employees/')
      return response.data
    }
  )

  const { data: riskScores = [], isLoading: risksLoading, isError: risksError } = useQuery<RiskScore[]>(
    'risk-scores',
    async () => {
      const response = await apiClient.get('risk-scores/')
      return response.data
    }
  )

  const { data: analytics = [], isLoading: analyticsLoading, isError: analyticsError } = useQuery<AnalyticsItem[]>(
    'analytics',
    async () => {
      const response = await apiClient.get('analytics/')
      return response.data
    }
  )

  const summary = useMemo(
    () => ({
      totalLocations: locations.length,
      totalEmployees: employees.length,
      riskLocations: riskScores.filter((item) => ['high', 'critical'].includes(item.risk_level)).length,
      revenue: analytics.reduce(
        (sum, item) => sum + Number(item.estimated_revenue || item.reported_revenue || 0),
        0
      ),
    }),
    [analytics, employees, locations, riskScores]
  )

  const chartData = useMemo(() => {
    const latestAnalytics = [...analytics]
      .slice(0, 7)
      .reverse()
      .map((item) => ({
        name: new Date(item.date).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' }),
        customers: item.real_customers,
        revenue: Number(item.estimated_revenue || item.reported_revenue || 0),
      }))

    return latestAnalytics.length ? latestAnalytics : fallbackChartData
  }, [analytics])

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

  const isLoading = locationsLoading || employeesLoading || risksLoading || analyticsLoading
  const hasError = locationsError || employeesError || risksError || analyticsError

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

  if (hasError) {
    return <Alert severity="error">Dashboard ma'lumotlarini yuklashda xatolik yuz berdi.</Alert>
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
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
                    Tushum
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
      </Grid>
    </Box>
  )
}

export default Dashboard
