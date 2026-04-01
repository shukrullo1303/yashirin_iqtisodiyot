import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  MenuItem,
  Stack,
} from '@mui/material'
import { Edit, Delete, Add as AddIcon, OpenInNew, CheckCircle } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import GoogleMapPicker from '../components/GoogleMapPicker'

interface Location {
  id: number
  name: string
  address: string
  tax_id?: string | null
  is_active: boolean
  is_registered: boolean
  location_type: string
  latitude?: number | null
  longitude?: number | null
}

interface LocationFormValues {
  name: string
  address: string
  tax_id: string
  location_type: string
  is_active: boolean
  latitude: number | null
  longitude: number | null
}

const defaultFormValues: LocationFormValues = {
  name: '',
  address: '',
  tax_id: '',
  location_type: 'other',
  is_active: true,
  latitude: null,
  longitude: null,
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

  return error?.message || 'Xatolik yuz berdi'
}

function Locations() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [formValues, setFormValues] = useState<LocationFormValues>(defaultFormValues)

  const openMapWindow = () => {
    window.open('/locations-map', 'all-locations-map', 'width=1450,height=900,resizable=yes,scrollbars=yes')
  }

  const { data: locations = [], isLoading, isError } = useQuery<Location[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const mappedLocationsCount = useMemo(
    () => locations.filter((item) => typeof item.latitude === 'number' && typeof item.longitude === 'number').length,
    [locations]
  )

  const saveMutation = useMutation<any, any, LocationFormValues>(
    (data) => {
      const payload = {
        ...data,
        tax_id: data.tax_id || null,
      }

      if (selectedLocation) {
        return apiClient.put(`locations/${selectedLocation.id}/`, payload)
      }

      return apiClient.post('locations/', payload)
    },
    {
      onSuccess: () => {
        toast.success(selectedLocation ? 'Lokatsiya yangilandi' : 'Lokatsiya qo‘shildi')
        queryClient.invalidateQueries('locations')
        handleClose()
      },
      onError: (err: any) => {
        toast.error(extractErrorMessage(err))
      },
    }
  )

  const deleteMutation = useMutation<void, any, number>((id) => apiClient.delete(`locations/${id}/`), {
    onSuccess: () => {
      toast.success('Lokatsiya o‘chirildi')
      queryClient.invalidateQueries('locations')
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const checkRegistrationMutation = useMutation<any, any, number>((locationId) => apiClient.post('tax-integrations/check-registration/', { location_id: locationId }), {
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries('locations')
    },
    onError: (err: any) => {
      toast.error(extractErrorMessage(err))
    },
  })

  const handleOpen = (location: Location | null = null) => {
    setSelectedLocation(location)
    setFormValues(
      location
        ? {
            name: location.name,
            address: location.address,
            tax_id: location.tax_id || '',
            location_type: location.location_type,
            is_active: location.is_active,
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
          }
        : defaultFormValues
    )
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setSelectedLocation(null)
    setFormValues(defaultFormValues)
  }

  const handleDelete = (id: number) => {
    if (window.confirm("Ushbu lokatsiyani o'chirishni xohlaysizmi?")) {
      deleteMutation.mutate(id)
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target

    setFormValues((prev) => ({
      ...prev,
      [name]:
        name === 'latitude' || name === 'longitude'
          ? value === ''
            ? null
            : Number(value)
          : name === 'is_active'
            ? value === 'true'
            : value,
    }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveMutation.mutate(formValues)
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return <Alert severity="error">Ma'lumotlarni yuklashda xatolik!</Alert>
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4">Lokatsiyalar</Typography>
          <Typography variant="body2" color="text.secondary">
            {mappedLocationsCount} ta lokatsiya Asaka GeoJSON xaritasida belgilangan.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
          <Button variant="outlined" startIcon={<OpenInNew />} onClick={openMapWindow}>
            Barcha lokatsiyalarni xaritada ochish
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Asaka xaritasida qo'shish
          </Button>
        </Stack>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Nomi</TableCell>
              <TableCell>Manzil</TableCell>
              <TableCell>Koordinata</TableCell>
              <TableCell>INN</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Ro'yxatdan o'tgan</TableCell>
              <TableCell align="right">Amallar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {locations.map((loc) => (
              <TableRow key={loc.id} hover>
                <TableCell>{loc.name}</TableCell>
                <TableCell>{loc.address}</TableCell>
                <TableCell>
                  {typeof loc.latitude === 'number' && typeof loc.longitude === 'number' ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                      </Typography>
                      <IconButton
                        size="small"
                        component="a"
                        href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=16/${loc.latitude}/${loc.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <OpenInNew fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>{loc.tax_id || '-'}</TableCell>
                <TableCell>
                  <Chip label={loc.is_active ? 'Faol' : 'Nofaol'} color={loc.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell>
                  <Chip label={loc.is_registered ? 'Ha' : 'Yo\'q'} color={loc.is_registered ? 'success' : 'error'} size="small" />
                </TableCell>
                <TableCell align="right">
                  <IconButton color="secondary" onClick={() => checkRegistrationMutation.mutate(loc.id)} disabled={checkRegistrationMutation.isLoading}>
                    <CheckCircle fontSize="small" />
                  </IconButton>
                  <IconButton color="primary" onClick={() => handleOpen(loc)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton color="error" onClick={() => handleDelete(loc.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{selectedLocation ? 'Lokatsiyani tahrirlash' : 'Yangi lokatsiya qo\'shish'}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField name="name" label="Lokatsiya nomi" fullWidth required value={formValues.name} onChange={handleInputChange} />
              <TextField name="address" label="Manzil" fullWidth required value={formValues.address} onChange={handleInputChange} />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField name="tax_id" label="INN (Tax ID)" fullWidth value={formValues.tax_id} onChange={handleInputChange} />
                <TextField
                  select
                  name="location_type"
                  label="Turi"
                  fullWidth
                  required
                  value={formValues.location_type}
                  onChange={handleInputChange}
                >
                  <MenuItem value="cafe">Kafe</MenuItem>
                  <MenuItem value="restaurant">Restoran</MenuItem>
                  <MenuItem value="tea_house">Choyxona</MenuItem>
                  <MenuItem value="hair_salon">Sartaroshxona</MenuItem>
                  <MenuItem value="car_wash">Avtoyuvish</MenuItem>
                  <MenuItem value="service_center">Servis markaz</MenuItem>
                  <MenuItem value="household_service">Maishiy xizmat</MenuItem>
                  <MenuItem value="other">Boshqa</MenuItem>
                </TextField>
                <TextField
                  select
                  name="is_active"
                  label="Status"
                  fullWidth
                  value={String(formValues.is_active)}
                  onChange={handleInputChange}
                >
                  <MenuItem value="true">Faol</MenuItem>
                  <MenuItem value="false">Nofaol</MenuItem>
                </TextField>
              </Stack>

              <GoogleMapPicker
                value={{ lat: formValues.latitude, lng: formValues.longitude }}
                onChange={(coords) => setFormValues((prev) => ({ ...prev, latitude: coords.lat, longitude: coords.lng }))}
                onAddressSelect={(address) =>
                  setFormValues((prev) => ({
                    ...prev,
                    address: prev.address.trim() ? prev.address : address,
                  }))
                }
                height={360}
              />

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  name="latitude"
                  label="Latitude"
                  fullWidth
                  value={formValues.latitude ?? ''}
                  onChange={handleInputChange}
                />
                <TextField
                  name="longitude"
                  label="Longitude"
                  fullWidth
                  value={formValues.longitude ?? ''}
                  onChange={handleInputChange}
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={handleClose} color="inherit">
              Bekor qilish
            </Button>
            <Button type="submit" variant="contained" disabled={saveMutation.isLoading}>
              {saveMutation.isLoading ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  )
}

export default Locations