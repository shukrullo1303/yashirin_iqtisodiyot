import { Fragment, useEffect, useMemo, useState } from 'react'
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
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Avatar,
} from '@mui/material'
import { Edit, Delete, Add, Replay } from '@mui/icons-material'
import apiClient from '../api/client'
import { asList } from '../utils/asList'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

const extractErrorMessage = (error: any) => error?.response?.data?.detail || error?.message || 'Amalni bajarib bo‘lmadi'

interface Employee {
  id: number
  full_name: string
  position?: string | null
  phone?: string | null
  jshshir?: string | null
  is_registered: boolean
  is_active: boolean
  location_name?: string
  location?: number
  latest_image_path?: string | null
  monitoring_id?: string | null
}

interface EmployeeFace {
  id: number
  employee: number
  image_path?: string | null
  created_at: string
}

interface Location {
  id: number
  name: string
}

function Employees() {
  const { user } = useAuthStore()
  const canManageEmployees = Boolean((user as any)?.is_superuser)
  const [selectedLocation, setSelectedLocation] = useState<number | ''>('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState({
    full_name: '',
    position: '',
    phone: '',
    jshshir: '',
    location: '',
    image: null as File | null,
  })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [galleryEmployee, setGalleryEmployee] = useState<Employee | null>(null)

  const mediaUrl = (path?: string | null) => path ? `/media/${String(path).replace(/^\/+/, '')}` : undefined

  useEffect(() => {
    if (!formData.image) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(formData.image)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [formData.image])

  const queryClient = useQueryClient()

  const employeesQuery = useQuery<unknown>('employees', async () => {
    const response = await apiClient.get('employees/')
    return response.data
  })

  const locationsQuery = useQuery<unknown>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })
  const employeeFacesQuery = useQuery<unknown>(
    ['employee-faces', galleryEmployee?.id],
    async () => (await apiClient.get('employee-faces/', { params: { employee_id: galleryEmployee?.id } })).data,
    { enabled: Boolean(galleryEmployee) }
  )

  const employees = asList<Employee>(employeesQuery.data)
  const locations = asList<Location>(locationsQuery.data)
  const isLoading = employeesQuery.isLoading || locationsQuery.isLoading
  const isError = employeesQuery.isError
  const employeeFaces = asList<EmployeeFace>(employeeFacesQuery.data)

  const deleteMutation = useMutation(
    (id: number) => apiClient.delete(`employees/${id}/`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees')
      },
    }
  )
  const returnToCustomerMutation = useMutation(
    (id: number) => apiClient.post(`employees/${id}/return-to-customer/`),
    { onSuccess: () => { toast.success('Yuz mijoz rejimiga qaytarildi'); queryClient.invalidateQueries('employees') }, onError: (err: any) => { toast.error(extractErrorMessage(err)) } }
  )

  const addMutation = useMutation(
    (data: FormData) => apiClient.post('employees/', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees')
        setAddDialogOpen(false)
        setFormData({ full_name: '', position: '', phone: '', jshshir: '', location: '', image: null })
        setImagePreviewUrl(null)
      },
    }
  )

  const editMutation = useMutation(
    ({ id, data }: { id: number; data: FormData }) =>
      apiClient.patch(`employees/${id}/`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees')
        setEditDialogOpen(false)
        setEditingEmployee(null)
      },
    }
  )

  const filteredEmployees = selectedLocation
    ? employees.filter((emp) => emp.location === selectedLocation)
    : employees
  const employeeGroups = useMemo(() => {
    const groups = new Map<string, Employee[]>()
    filteredEmployees.forEach((employee) => {
      const name = employee.location_name || 'Noma’lum lokatsiya'
      groups.set(name, [...(groups.get(name) ?? []), employee])
    })
    return [...groups.entries()]
  }, [filteredEmployees])

  const handleAdd = () => {
    const payload = new FormData()
    payload.append('full_name', formData.full_name)
    payload.append('position', formData.position)
    payload.append('phone', formData.phone)
    payload.append('jshshir', formData.jshshir)
    payload.append('location', formData.location.toString())
    if (formData.image) {
      payload.append('image', formData.image)
    }
    addMutation.mutate(payload)
  }

  const handleEdit = () => {
    if (editingEmployee) {
      const payload = new FormData()
      payload.append('full_name', formData.full_name)
      payload.append('position', formData.position)
      payload.append('phone', formData.phone)
      payload.append('jshshir', formData.jshshir)
      payload.append('location', formData.location.toString())
      if (formData.image) {
        payload.append('image', formData.image)
      }
      editMutation.mutate({ id: editingEmployee.id, data: payload })
    }
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Haqiqatan ham bu xodimni o\'chirmoqchimisiz?')) {
      deleteMutation.mutate(id)
    }
  }

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      full_name: employee.full_name,
      position: employee.position || '',
      phone: employee.phone || '',
      jshshir: employee.jshshir || '',
      location: employee.location?.toString() || '',
      image: null,
    })
    setEditDialogOpen(true)
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError && employees.length === 0) {
    return <Alert severity="error">Xodimlarni yuklashda xatolik yuz berdi.</Alert>
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Xodimlar
      </Typography>
      {locationsQuery.isError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Lokatsiyalar ro‘yxati yuklanmadi — filtr vaqtincha ishlamasligi mumkin.
        </Alert>
      ) : null}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Lokatsiya bo'yicha filtr</InputLabel>
          <Select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value as number | '')}
            label="Lokatsiya bo'yicha filtr"
          >
            <MenuItem value="">
              <em>Barcha</em>
            </MenuItem>
            {locations.map((location) => (
              <MenuItem key={location.id} value={location.id}>
                {location.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {canManageEmployees && <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setAddDialogOpen(true)}
        >
          Yangi xodim qo'shish
        </Button>}
      </Box>
      <TableContainer component={Paper} sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Rasm</TableCell>
              <TableCell>F.I.Sh.</TableCell>
              <TableCell>Lokatsiya</TableCell>
              <TableCell>Lavozim</TableCell>
              <TableCell>Telefon</TableCell>
              <TableCell>JSHSHIR</TableCell>
              <TableCell>Ro'yxatdan o'tgan</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Amallar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employeeGroups.map(([locationName, locationEmployees]) => (
              <Fragment key={`location-${locationName}`}>
                <TableRow>
                  <TableCell colSpan={9} sx={{ bgcolor: 'primary.50', fontWeight: 700 }}>
                    {locationName} — {locationEmployees.length} ta xodim
                  </TableCell>
                </TableRow>
                {locationEmployees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Avatar
                    src={mediaUrl(employee.latest_image_path)}
                    alt={employee.full_name}
                    variant="rounded"
                    imgProps={{
                      style: { objectFit: 'cover', objectPosition: 'center top' },
                    }}
                    sx={{ width: 72, height: 72, cursor: employee.latest_image_path ? 'pointer' : 'default', border: employee.latest_image_path ? '2px solid #f9a825' : undefined }}
                    onClick={() => employee.latest_image_path && setGalleryEmployee(employee)}
                  >
                    {employee.full_name.charAt(0)}
                  </Avatar>
                  {employee.latest_image_path && <Typography variant="caption" color="primary" sx={{ cursor: 'pointer', display: 'block', mt: .5 }} onClick={() => setGalleryEmployee(employee)}>Rasmlar</Typography>}
                </TableCell>
                <TableCell>{employee.full_name}{employee.monitoring_id && <Typography variant="caption" display="block" color="text.secondary">Kamera ID: {employee.monitoring_id}</Typography>}</TableCell>
                <TableCell>{employee.location_name || '-'}</TableCell>
                <TableCell>{employee.position || '-'}</TableCell>
                <TableCell>{employee.phone || '-'}</TableCell>
                <TableCell>{employee.jshshir || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={employee.is_registered ? 'Ha' : 'Yo\'q'}
                    color={employee.is_registered ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={employee.is_active ? 'Faol' : 'Nofaol'}
                    color={employee.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {canManageEmployees && <IconButton title="Xodim ma’lumotini tahrirlash" onClick={() => openEditDialog(employee)} size="small">
                    <Edit />
                  </IconButton>}
                  {canManageEmployees && <IconButton title="Xodimni o‘chirish" onClick={() => handleDelete(employee.id)} size="small">
                    <Delete />
                  </IconButton>}
                  {canManageEmployees && <IconButton color="warning" title="Mijozga qaytarish" onClick={() => { if (window.confirm(`${employee.full_name} keyingi kamera tahlilida yana mijoz bo‘ladi. Davom etasizmi?`)) returnToCustomerMutation.mutate(employee.id) }} size="small"><Replay /></IconButton>}
                </TableCell>
              </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogTitle>Yangi xodim qo'shish</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="F.I.Sh."
            fullWidth
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Lavozim"
            fullWidth
            value={formData.position}
            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Telefon"
            fullWidth
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <TextField
            margin="dense"
            label="JSHSHIR (14 raqam)"
            inputProps={{ maxLength: 14, inputMode: 'numeric' }}
            value={formData.jshshir}
            onChange={(e) => setFormData({ ...formData, jshshir: e.target.value.replace(/\D/g, '').slice(0, 14) })}
            helperText={`${formData.jshshir.length}/14`}
          />
          <Button component="label" variant="outlined" sx={{ mt: 1, mb: 1 }}>
            Rasm tanlash
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setFormData({ ...formData, image: file })
              }}
            />
          </Button>
          {formData.image && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Tanlangan fayl: {formData.image.name}
            </Typography>
          )}
          {imagePreviewUrl && (
            <Box
              sx={{
                mt: 1,
                mb: 1,
                width: 160,
                height: 160,
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                alignSelf: 'center',
              }}
            >
              <Box
                component="img"
                src={imagePreviewUrl}
                alt="Yuz oldko‘rinishi"
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center top',
                }}
              />
            </Box>
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Lokatsiya</InputLabel>
            <Select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              label="Lokatsiya"
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Bekor qilish</Button>
          <Button onClick={handleAdd} variant="contained">
            Qo'shish
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Xodimni tahrirlash</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="F.I.Sh."
            fullWidth
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Lavozim"
            fullWidth
            value={formData.position}
            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Telefon"
            fullWidth
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <TextField
            margin="dense"
            label="JSHSHIR (14 raqam)"
            inputProps={{ maxLength: 14, inputMode: 'numeric' }}
            value={formData.jshshir}
            onChange={(e) => setFormData({ ...formData, jshshir: e.target.value.replace(/\D/g, '').slice(0, 14) })}
            helperText={`${formData.jshshir.length}/14`}
          />
          <Button component="label" variant="outlined" sx={{ mt: 1, mb: 1 }}>
            Rasm tanlash
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setFormData({ ...formData, image: file })
              }}
            />
          </Button>
          {formData.image && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Tanlangan fayl: {formData.image.name}
            </Typography>
          )}
          {(formData.image
            ? imagePreviewUrl
            : editingEmployee?.latest_image_path
              ? mediaUrl(editingEmployee.latest_image_path)
              : null) && (
            <Box
              sx={{
                mt: 1,
                mb: 1,
                width: 160,
                height: 160,
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                alignSelf: 'center',
              }}
            >
              <Box
                component="img"
                src={
                  (formData.image
                    ? imagePreviewUrl
                    : mediaUrl(editingEmployee?.latest_image_path)) as string
                }
                alt="Yuz oldko‘rinishi"
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center top',
                }}
              />
            </Box>
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Lokatsiya</InputLabel>
            <Select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              label="Lokatsiya"
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Bekor qilish</Button>
          <Button onClick={handleEdit} variant="contained">
            Saqlash
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(galleryEmployee)} onClose={() => setGalleryEmployee(null)} fullWidth maxWidth="md">
        <DialogTitle>{galleryEmployee?.full_name} — saqlangan rasmlar</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Xodimga yangi rasm biriktirilsa, avvalgi rasmlar saqlanadi. Quyidagi suratlar yuzni aniqroq tanishga yordam beradi.
          </Typography>
          {employeeFacesQuery.isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box> : employeeFaces.length === 0 ? (
            <Alert severity="info">Bu xodim uchun saqlangan rasm yo‘q.</Alert>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 2 }}>
              {employeeFaces.map((face) => <Paper key={face.id} variant="outlined" sx={{ p: 1 }}>
                {face.image_path ? <Box component="img" src={mediaUrl(face.image_path)} alt={`${galleryEmployee?.full_name} rasmi`} sx={{ width: '100%', height: 160, objectFit: 'cover', objectPosition: 'center top', borderRadius: 1 }} /> : <Box sx={{ height: 160, display: 'grid', placeItems: 'center', bgcolor: 'grey.100' }}>Rasm yo‘q</Box>}
                <Typography variant="caption" display="block" sx={{ mt: .75, textAlign: 'center' }}>Face ID: {face.id} · {new Date(face.created_at).toLocaleString('uz-UZ', { hour12: false })}</Typography>
              </Paper>)}
            </Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setGalleryEmployee(null)}>Yopish</Button></DialogActions>
      </Dialog>
    </Box>
  )
}

export default Employees
