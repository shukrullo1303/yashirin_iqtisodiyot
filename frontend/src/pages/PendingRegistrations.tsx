import { useQuery, useQueryClient } from 'react-query'
import { Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { toast } from 'react-hot-toast'
import apiClient from '../api/client'

type Registration = { id: number; username: string; full_name: string; email: string; date_joined: string }
type Location = { id: number; name: string }

const roles = [
  ['analyst', 'Analitik'],
  ['tax_inspector', 'Soliq inspektori'],
  ['business_owner', 'Biznes egasi'],
  ['cafe_manager', 'Kafe menejeri'],
  ['waiter', 'Ofitsiant'],
  ['kitchen', 'Oshpaz'],
]

export default function PendingRegistrations() {
  const queryClient = useQueryClient()
  const registrations = useQuery<Registration[]>('pending-registrations', async () => (
    (await apiClient.get('pending-registrations/')).data
  ))
  const locations = useQuery<Location[]>('locations', async () => (
    (await apiClient.get('locations/')).data
  ))

  const approve = async (id: number, form: HTMLFormElement) => {
    const data = new FormData(form)
    try {
      await apiClient.post(`pending-registrations/${id}/approve/`, {
        role: data.get('role'),
        location: data.get('location') || null,
      })
      toast.success('Foydalanuvchi tasdiqlandi.')
      queryClient.invalidateQueries('pending-registrations')
    } catch {
      toast.error('Tasdiqlashda xatolik yuz berdi.')
    }
  }

  const reject = async (id: number) => {
    try {
      await apiClient.post(`pending-registrations/${id}/reject/`)
      toast.success('Ariza rad etildi.')
      queryClient.invalidateQueries('pending-registrations')
    } catch {
      toast.error('Arizani rad etib bo‘lmadi.')
    }
  }

  return <Stack spacing={2}>
    <Typography variant="h4">Ro‘yxatdan o‘tish arizalari</Typography>
    {registrations.isLoading && <Typography>Yuklanmoqda…</Typography>}
    {!registrations.isLoading && !registrations.data?.length && <Typography>Tasdiqlash kutilayotgan ariza yo‘q.</Typography>}
    {registrations.data?.map((user) => <Paper key={user.id} sx={{ p: 2 }}>
      <Typography variant="h6">{user.full_name} <Chip size="small" label={user.username} /></Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{user.email}</Typography>
      <Stack component="form" direction={{ xs: 'column', md: 'row' }} spacing={1} onSubmit={(e) => { e.preventDefault(); approve(user.id, e.currentTarget) }}>
        <TextField select name="role" label="Rol" defaultValue="analyst" required sx={{ minWidth: 180 }}>
          {roles.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField select name="location" label="Lokatsiya" defaultValue="" sx={{ minWidth: 220 }}>
          <MenuItem value="">Biriktirilmagan</MenuItem>
          {locations.data?.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
        </TextField>
        <Button type="submit" variant="contained">Tasdiqlash</Button>
        <Button color="error" onClick={() => reject(user.id)}>Rad etish</Button>
      </Stack>
    </Paper>)}
  </Stack>
}
