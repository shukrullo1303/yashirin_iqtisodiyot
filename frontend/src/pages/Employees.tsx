import React, { useState } from 'react'
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
import { Edit, Delete, Add } from '@mui/icons-material'
import apiClient from '../api/client'

interface Employee {
  id: number
  full_name: string
  position?: string | null
  phone?: string | null
  is_registered: boolean
  is_active: boolean
  location_name?: string
  location?: number
  latest_image_path?: string | null
}

interface Location {
  id: number
  name: string
}

function Employees() {
  const [selectedLocation, setSelectedLocation] = useState<number | ''>('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState({
    full_name: '',
    position: '',
    phone: '',
    location: '',
    image: null as File | null,
  })

  const queryClient = useQueryClient()

  const { data: employees = [], isLoading, isError } = useQuery<Employee[]>('employees', async () => {
    const response = await apiClient.get('employees/')
    return response.data
  })

  const { data: locations = [] } = useQuery<Location[]>('locations', async () => {
    const response = await apiClient.get('locations/')
    return response.data
  })

  const deleteMutation = useMutation(
    (id: number) => apiClient.delete(`employees/${id}/`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees')
      },
    }
  )

  const addMutation = useMutation(
    (data: FormData) => apiClient.post('employees/', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('employees')
        setAddDialogOpen(false)
        setFormData({ full_name: '', position: '', phone: '', location: '', image: null })
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

  const handleAdd = () => {
    const payload = new FormData()
    payload.append('full_name', formData.full_name)
    payload.append('position', formData.position)
    payload.append('phone', formData.phone)
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

  if (isError) {
    return <Alert severity="error">Xodimlarni yuklashda xatolik yuz berdi.</Alert>
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Xodimlar
      </Typography>
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
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setAddDialogOpen(true)}
        >
          Yangi xodim qo'shish
        </Button>
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
              <TableCell>Ro'yxatdan o'tgan</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Amallar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEmployees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Avatar
                    src={employee.latest_image_path ? `${apiClient.defaults.baseURL}/media/${employee.latest_image_path}` : undefined}
                    alt={employee.full_name}
                    sx={{ width: 40, height: 40 }}
                  >
                    {employee.full_name.charAt(0)}
                  </Avatar>
                </TableCell>
                <TableCell>{employee.full_name}</TableCell>
                <TableCell>{employee.location_name || '-'}</TableCell>
                <TableCell>{employee.position || '-'}</TableCell>
                <TableCell>{employee.phone || '-'}</TableCell>
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
                  <IconButton onClick={() => openEditDialog(employee)} size="small">
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(employee.id)} size="small">
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
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
    </Box>
  )
}

export default Employees
