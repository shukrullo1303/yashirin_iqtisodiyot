import React, { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { ArrowBack, OpenInNew, Place } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import GoogleMapPicker from '../components/GoogleMapPicker'

interface Location {
  id: number
  name: string
  address: string
  tax_id?: string | null
  is_active: boolean
  location_type: string
  latitude?: number | null
  longitude?: number | null
}

const hasValidCoords = (location: Location) =>
  typeof location.latitude === 'number' && !Number.isNaN(location.latitude) && typeof location.longitude === 'number' && !Number.isNaN(location.longitude)

function LocationsMapWindow() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)

  const { data: locations = [], isLoading, isError } = useQuery<Location[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return locations
    }

    return locations.filter((item) => {
      return [item.name, item.address, item.tax_id, item.location_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [locations, search])

  const selectedLocation = useMemo(() => {
    return filteredLocations.find((item) => item.id === selectedLocationId) ?? filteredLocations[0] ?? null
  }, [filteredLocations, selectedLocationId])

  const mapMarkers = useMemo(
    () =>
      filteredLocations
        .filter(hasValidCoords)
        .map((item) => ({
          id: item.id,
          lat: item.latitude ?? null,
          lng: item.longitude ?? null,
          title: item.name,
          description: item.address,
        })),
    [filteredLocations]
  )

  const mapHeight = typeof window !== 'undefined' ? Math.max(500, window.innerHeight - 220) : 680

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Lokatsiyalarni yuklashda xatolik yuz berdi.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: 2.5, mb: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Barcha lokatsiyalar xaritasi
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Bazadagi barcha lokatsiyalar bitta oynada, to‘liq xarita va yonma-yon ro‘yxat bilan ko‘rsatiladi.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Chip label={`${locations.length} ta jami`} color="primary" variant="outlined" />
            <Chip label={`${mapMarkers.length} ta koordinatali`} color="success" variant="outlined" />
            <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/locations')}>
              Orqaga
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            {mapMarkers.length ? (
              <GoogleMapPicker
                readOnly
                markers={mapMarkers}
                value={
                  selectedLocation && hasValidCoords(selectedLocation)
                    ? { lat: selectedLocation.latitude ?? null, lng: selectedLocation.longitude ?? null }
                    : undefined
                }
                height={mapHeight}
              />
            ) : (
              <Alert severity="info">Koordinata saqlangan lokatsiyalar topilmadi.</Alert>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Lokatsiyalar ro‘yxati
            </Typography>

            <TextField
              fullWidth
              size="small"
              label="Nomi yoki manzil bo‘yicha qidiring"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ mb: 2 }}
            />

            <List sx={{ maxHeight: mapHeight, overflowY: 'auto', p: 0 }}>
              {filteredLocations.map((location, index) => {
                const isSelected = location.id === selectedLocation?.id
                const coords = hasValidCoords(location)

                return (
                  <React.Fragment key={location.id}>
                    <ListItemButton
                      selected={isSelected}
                      onClick={() => setSelectedLocationId(location.id)}
                      sx={{ borderRadius: 2, alignItems: 'flex-start' }}
                    >
                      <Place color={isSelected ? 'primary' : 'action'} sx={{ mt: 0.5, mr: 1 }} />
                      <Box sx={{ flex: 1 }}>
                        <ListItemText
                          primary={location.name}
                          secondary={
                            <>
                              <Typography component="span" variant="body2" color="text.secondary">
                                {location.address || 'Manzil kiritilmagan'}
                              </Typography>
                              <br />
                              <Typography component="span" variant="caption" color="text.secondary">
                                {coords
                                  ? `${location.latitude?.toFixed(6)}, ${location.longitude?.toFixed(6)}`
                                  : 'Koordinata mavjud emas'}
                              </Typography>
                            </>
                          }
                        />

                        {coords && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<OpenInNew fontSize="small" />}
                            component="a"
                            href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            sx={{ mt: 0.5 }}
                          >
                            OSM’da ochish
                          </Button>
                        )}
                      </Box>
                    </ListItemButton>
                    {index < filteredLocations.length - 1 && <Divider sx={{ my: 0.5 }} />}
                  </React.Fragment>
                )
              })}

              {!filteredLocations.length && (
                <Alert severity="info">Qidiruv bo‘yicha lokatsiya topilmadi.</Alert>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default LocationsMapWindow
