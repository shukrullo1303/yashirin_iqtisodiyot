import React from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { PersonAdd } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'

type Potential = { id: number; visitor_id: string; location_name?: string; duration_minutes: number; detected_at: string; entry_image_path?: string; exit_image_path?: string; image_path?: string; status: string }

const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)} soat ${Math.round(minutes % 60)} daqiqa`

export default function PotentialEmployees() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = React.useState<Potential | null>(null)
  const [form, setForm] = React.useState({ full_name: '', jshshir: '' })
  const query = useQuery<Potential[]>('potential-employees', async () => (await apiClient.get('potential-employees/', { params: { status: 'pending' } })).data, { refetchInterval: 10000 })
  const register = async (item: Potential) => {
    try {
      if (!form.full_name.trim()) return toast.error('Ism-familiya majburiy')
      if (!/^\d{14}$/.test(form.jshshir)) return toast.error('JSHSHIR 14 ta raqamdan iborat bo‘lishi kerak')
      await apiClient.post(`potential-employees/${item.id}/register/`, { ...form, full_name: form.full_name.trim(), position: 'Xodim' })
      toast.success(`${form.full_name} xodim sifatida ro‘yxatga olindi`)
      setSelected(null)
      setForm({ full_name: '', jshshir: '' })
      queryClient.invalidateQueries('potential-employees')
      queryClient.invalidateQueries('employees')
      queryClient.invalidateQueries('visitor-summary')
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Ro‘yxatga olishda xatolik yuz berdi')
    }
  }
  return <Box>
      <Typography variant="h4" gutterBottom>Ehtimoliy xodimlar</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>3 soatdan ko‘p qolgan, soliq inspektori tekshirishi kerak bo‘lgan tashriflar.</Typography>
    {query.isError && <Alert severity="error">Ehtimoliy xodimlar ma’lumotini yuklab bo‘lmadi.</Alert>}
    {!query.isLoading && !query.data?.length && <Alert severity="success">Hozircha tekshiruv kutilayotgan odam yo‘q.</Alert>}
      {!!query.data?.length && <Paper sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>ID</TableCell><TableCell>Kirish rasmi</TableCell><TableCell>Chiqish rasmi</TableCell><TableCell>Lokatsiya</TableCell><TableCell>Qolgan vaqt</TableCell><TableCell>Aniqlangan vaqt</TableCell><TableCell>Holat</TableCell><TableCell>Amal</TableCell></TableRow></TableHead><TableBody>{query.data.map((item) => <TableRow key={item.id}><TableCell><b>{item.visitor_id}</b></TableCell><TableCell>{item.entry_image_path || item.image_path ? <Box component="img" src={`/media/${item.entry_image_path || item.image_path}`} alt="Kirish rasmi" sx={{ width: 86, height: 64, objectFit: 'cover', borderRadius: 1 }} /> : 'Rasm yo‘q'}</TableCell><TableCell>{item.exit_image_path ? <Box component="img" src={`/media/${item.exit_image_path}`} alt="Chiqish rasmi" sx={{ width: 86, height: 64, objectFit: 'cover', borderRadius: 1 }} /> : 'Hali chiqmagan'}</TableCell><TableCell>{item.location_name || '—'}</TableCell><TableCell>{formatDuration(Number(item.duration_minutes || 0))}</TableCell><TableCell>{new Date(item.detected_at).toLocaleString('uz-UZ', { hour12: false })}</TableCell><TableCell><Chip label="Tekshiruv kutilmoqda" color="warning" size="small" /></TableCell><TableCell><Button size="small" variant="contained" startIcon={<PersonAdd />} onClick={() => { setSelected(item); setForm({ full_name: '', jshshir: '' }) }}>Xodimga qo‘shish</Button></TableCell></TableRow>)}</TableBody></Table></Paper>}
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
      <DialogTitle>Xodim ma’lumotlarini kiriting</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '16px !important' }}>
        <Typography variant="body2" color="text.secondary">{selected?.visitor_id} — {selected?.location_name || 'Lokatsiya'}</Typography>
        <TextField label="Ism-familiya" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      <TextField label="JSHSHIR (14 raqam)" required inputProps={{ maxLength: 14, inputMode: 'numeric' }} value={form.jshshir} onChange={(e) => setForm({ ...form, jshshir: e.target.value.replace(/\D/g, '').slice(0, 14) })} helperText={`${form.jshshir.length}/14`} />
      </DialogContent>
      <DialogActions><Button onClick={() => setSelected(null)}>Bekor qilish</Button><Button variant="contained" onClick={() => selected && register(selected)}>Saqlash</Button></DialogActions>
    </Dialog>
  </Box>
}
