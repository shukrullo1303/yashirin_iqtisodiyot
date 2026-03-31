import React, { useMemo, useState } from 'react'
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
} from '@mui/material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import apiClient from '../api/client'

interface Location {
  id: number
  name: string
}

interface AnalyticsItem {
  id: number
  date: string
  real_customers: number
  reported_revenue: number
  discrepancy: number
}

interface RiskScore {
  id: number
  risk_score: number
  risk_level: string
}

function Analytics() {
  const [locationId, setLocationId] = useState<number | ''>('')

  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<AnalyticsItem[]>(
    ['analytics', locationId],
    async () => {
      const response = await apiClient.get('analytics/', {
        params: { location_id: locationId },
      })
      return response.data
    },
    { enabled: !!locationId }
  )

  const { data: riskScores = [], isLoading: risksLoading } = useQuery<RiskScore[]>(
    ['risk-scores', locationId],
    async () => {
      const response = await apiClient.get('risk-scores/', {
        params: { location_id: locationId },
      })
      return response.data
    },
    { enabled: !!locationId }
  )

  const riskScore = riskScores[0]

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

  if (locationsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Analitika
      </Typography>
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
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Risk bahosi
          </Typography>
          <Typography variant="h3" color={riskScore.risk_level === 'critical' ? 'error' : 'warning.main'}>
            {Number(riskScore.risk_score || 0).toFixed(1)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Daraja: {riskScore.risk_level}
          </Typography>
        </Paper>
      )}

      {locationId && !riskScore && !risksLoading && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Tanlangan lokatsiya uchun risk ma'lumoti topilmadi.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Mijozlar va tushum tahlili
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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Analytics
