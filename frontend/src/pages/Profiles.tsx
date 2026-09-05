import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemButton, ListItemText, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { Add, Delete, Edit } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import { asList } from '../utils/asList'

type Location = { id: number; name: string }
type Profile = { id: number; username: string; full_name: string; role: string; location?: number | null; location_name?: string | null; assigned_location_names?: string[]; assigned_locations?: number[]; is_active: boolean }
const roleNames: Record<string, string> = { tax_inspector: 'Soliq inspektori', business_owner: 'Lokatsiya egasi', analyst: 'Analitik' }

export default function Profiles() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'tax_inspector', location: '', assigned_locations: [] as number[] })
  const [assignmentProfile, setAssignmentProfile] = useState<Profile | null>(null)
  const [assignedIds, setAssignedIds] = useState<number[]>([])
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({ username: '', full_name: '', password: '', role: 'tax_inspector', location: '' })
  const profilesQuery = useQuery<unknown>('profiles', async () => (await apiClient.get('profiles/')).data)
  const locationsQuery = useQuery<unknown>('locations', async () => (await apiClient.get('locations/')).data)
  const create = useMutation(() => apiClient.post('profiles/', { ...form, location: form.location || null }), {
    onSuccess: () => {
      toast.success('Yangi profil yaratildi')
      queryClient.invalidateQueries('profiles')
      setOpen(false)
      setForm({ username: '', full_name: '', password: '', role: 'tax_inspector', location: '', assigned_locations: [] })
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Profil yaratilmadi')
    },
  })
  const updateAssignments = useMutation(() => apiClient.patch(`profiles/${assignmentProfile?.id}/`, { assigned_locations: assignedIds }), {
    onSuccess: () => { toast.success('Lokatsiyalar biriktirildi'); queryClient.invalidateQueries('profiles'); setAssignmentProfile(null) },
    onError: (error: any) => { toast.error(error?.response?.data?.detail || 'Biriktirish saqlanmadi') },
  })
  const updateProfile = useMutation(() => apiClient.patch(`profiles/${editingProfile?.id}/`, { ...editForm, password: editForm.password || undefined, location: editForm.location || null }), {
    onSuccess: () => { toast.success('Profil yangilandi'); queryClient.invalidateQueries('profiles'); setEditingProfile(null) },
    onError: (error: any) => { toast.error(error?.response?.data?.detail || 'Profil yangilanmadi') },
  })
  const remove = useMutation((id: number) => apiClient.delete(`profiles/${id}/`), {
    onSuccess: () => {
      toast.success('Profil o‘chirildi')
      queryClient.invalidateQueries('profiles')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Profil o‘chirilmadi')
    },
  })
  const profiles = asList<Profile>(profilesQuery.data)
  const locations = asList<Location>(locationsQuery.data)
  // Soliqchi uchun `location` (eski bitta-lokatsiya maydoni) va
  // `assigned_locations` ikkalasi ham band deb olinadi. Shunda eski
  // ma'lumot sabab lokatsiya ikkinchi inspektorga ko‘rinib qolmaydi.
  const assignedToOther = (profileId?: number) => new Set(profiles
    .filter((profile) => profile.role === 'tax_inspector' && profile.id !== profileId)
    .flatMap((profile) => [...(profile.assigned_locations || []), ...(profile.location ? [profile.location] : [])]))
  const availableNewLocations = locations.filter((location) => !assignedToOther().has(location.id))
  const assignmentOwnedLocations = locations.filter((location) => assignedIds.includes(location.id))
  const unassignedLocations = locations.filter((location) => !assignedToOther(assignmentProfile?.id).has(location.id) && !assignedIds.includes(location.id))
  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
      <Box><Typography variant="h4">Yangi profil yaratish</Typography><Typography color="text.secondary">Profilni faqat superadmin yaratadi; ochiq ro‘yxatdan o‘tish yo‘q.</Typography></Box>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Profil yaratish</Button>
    </Box>
    {profilesQuery.isError ? <Alert severity="error">Profillar yuklanmadi.</Alert> : <Paper><Table><TableHead><TableRow><TableCell>F.I.Sh.</TableCell><TableCell>Login</TableCell><TableCell>Rol</TableCell><TableCell>Lokatsiya</TableCell><TableCell>Holat</TableCell><TableCell>Amal</TableCell></TableRow></TableHead><TableBody>
      {profiles.map((profile) => <TableRow key={profile.id}><TableCell>{profile.full_name}</TableCell><TableCell>{profile.username}</TableCell><TableCell>{roleNames[profile.role] || profile.role}</TableCell><TableCell>{profile.role === 'tax_inspector' ? (profile.assigned_location_names?.join(', ') || 'Biriktirilmagan') : (profile.location_name || '—')}</TableCell><TableCell>{profile.is_active ? 'Faol' : 'Nofaol'}</TableCell><TableCell><Button size="small" startIcon={<Edit />} onClick={() => { setEditingProfile(profile); setEditForm({ username: profile.username, full_name: profile.full_name, password: '', role: profile.role, location: profile.location ? String(profile.location) : '' }) }}>Tahrirlash</Button>{profile.role === 'tax_inspector' && <Button size="small" onClick={() => { setAssignmentProfile(profile); setAssignedIds(profile.assigned_locations || []) }}>Lokatsiyalar</Button>}<Button size="small" color="error" startIcon={<Delete />} disabled={remove.isLoading} onClick={() => { if (window.confirm(`${profile.full_name} profilini o‘chirasizmi?`)) remove.mutate(profile.id) }}>O‘chirish</Button></TableCell></TableRow>)}
    </TableBody></Table></Paper>}
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Yangi profil</DialogTitle><DialogContent>
      <TextField autoFocus fullWidth margin="dense" label="F.I.Sh." value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      <TextField fullWidth margin="dense" label="Login" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      <TextField fullWidth margin="dense" type="password" label="Parol" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <TextField select fullWidth margin="dense" label="Rol" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        <MenuItem value="tax_inspector">Soliq inspektori</MenuItem><MenuItem value="business_owner">Lokatsiya egasi</MenuItem><MenuItem value="analyst">Analitik</MenuItem>
      </TextField>
      {form.role !== 'tax_inspector' && <TextField select fullWidth margin="dense" label="Asosiy lokatsiya" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
        <MenuItem value="">Biriktirilmagan</MenuItem>{locations.map((location) => <MenuItem value={location.id} key={location.id}>{location.name}</MenuItem>)}
      </TextField>}
      {form.role === 'tax_inspector' && <Box sx={{ mt: 2 }}><Typography variant="body2" fontWeight={700}>Biriktirish mumkin bo‘lgan lokatsiyalar</Typography><List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mt: 1 }}>{availableNewLocations.length ? availableNewLocations.map((location) => <ListItem key={location.id} disablePadding><ListItemButton selected={form.assigned_locations.includes(location.id)} onClick={() => setForm({ ...form, assigned_locations: form.assigned_locations.includes(location.id) ? form.assigned_locations.filter((id) => id !== location.id) : [...form.assigned_locations, location.id] })}><ListItemText primary={location.name} secondary={form.assigned_locations.includes(location.id) ? 'Tanlangan' : 'Biriktirilmagan'} /></ListItemButton></ListItem>) : <ListItem><ListItemText primary="Bo‘sh lokatsiya yo‘q" /></ListItem>}</List></Box>}
    </DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Bekor qilish</Button><Button variant="contained" disabled={create.isLoading} onClick={() => create.mutate()}>Yaratish</Button></DialogActions></Dialog>
    <Dialog open={Boolean(assignmentProfile)} onClose={() => setAssignmentProfile(null)} fullWidth maxWidth="sm"><DialogTitle>{assignmentProfile?.full_name} — lokatsiyalar</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary">Boshqa soliqchiga biriktirilgan lokatsiyalar maxfiy: ular bu oynada umuman chiqmaydi.</Typography><Stack direction="row" spacing={1} sx={{ mt: 2, mb: 1 }}><Button size="small" variant="outlined" disabled>{assignmentOwnedLocations.length} ta biriktirilgan</Button><Button size="small" variant="outlined" disabled>{unassignedLocations.length} ta bo‘sh</Button></Stack><Typography variant="subtitle2" color="success.main" fontWeight={800}>BU SOLIQCHIGA BIRIKTIRILGAN LOKATSIYALAR</Typography><List sx={{ border: 1, borderColor: 'success.light', borderRadius: 1, mt: 1, mb: 2 }}>{assignmentOwnedLocations.length ? assignmentOwnedLocations.map((location) => <ListItem key={location.id} disablePadding><ListItemButton selected onClick={() => setAssignedIds((ids) => ids.filter((id) => id !== location.id))}><ListItemText primary={location.name} secondary="Biriktirilgan — olib tashlash uchun bosing" /></ListItemButton></ListItem>) : <ListItem><ListItemText primary="Hali hech qanday lokatsiya biriktirilmagan." /></ListItem>}</List><Divider sx={{ mb: 2 }} /><Typography variant="subtitle2" color="primary" fontWeight={800}>BIRIKTIRILMAGAN LOKATSIYALAR</Typography><List sx={{ border: 1, borderColor: 'primary.light', borderRadius: 1, mt: 1 }}>{unassignedLocations.length ? unassignedLocations.map((location) => <ListItem key={location.id} disablePadding><ListItemButton onClick={() => setAssignedIds((ids) => [...ids, location.id])}><ListItemText primary={location.name} secondary="Biriktirish uchun bosing" /></ListItemButton></ListItem>) : <ListItem><ListItemText primary="Bo‘sh lokatsiya yo‘q." /></ListItem>}</List></DialogContent><DialogActions><Button onClick={() => setAssignmentProfile(null)}>Bekor qilish</Button><Button variant="contained" onClick={() => updateAssignments.mutate()} disabled={updateAssignments.isLoading}>Saqlash</Button></DialogActions></Dialog>
    <Dialog open={Boolean(editingProfile)} onClose={() => setEditingProfile(null)} fullWidth maxWidth="sm"><DialogTitle>Profilni tahrirlash</DialogTitle><DialogContent><TextField autoFocus fullWidth margin="dense" label="F.I.Sh." value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /><TextField fullWidth margin="dense" label="Login" value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} /><TextField fullWidth margin="dense" type="password" label="Yangi parol (o‘zgartirmasangiz bo‘sh qoldiring)" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} /><TextField select fullWidth margin="dense" label="Rol" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}><MenuItem value="tax_inspector">Soliq inspektori</MenuItem><MenuItem value="business_owner">Lokatsiya egasi</MenuItem><MenuItem value="analyst">Analitik</MenuItem></TextField>{editForm.role !== 'tax_inspector' && <TextField select fullWidth margin="dense" label="Asosiy lokatsiya" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}><MenuItem value="">Biriktirilmagan</MenuItem>{locations.map((location) => <MenuItem value={location.id} key={location.id}>{location.name}</MenuItem>)}</TextField>} {editForm.role === 'tax_inspector' && <Alert severity="info" sx={{ mt: 2 }}>Soliqchi uchun asosiy lokatsiya tanlanmaydi. Bir nechta lokatsiyani alohida “Lokatsiyalar” tugmasi orqali biriktiring; boshqa soliqchiga berilganlari ko‘rinmaydi.</Alert>}</DialogContent><DialogActions><Button onClick={() => setEditingProfile(null)}>Bekor qilish</Button><Button variant="contained" onClick={() => updateProfile.mutate()} disabled={updateProfile.isLoading}>Saqlash</Button></DialogActions></Dialog>
  </Box>
}
