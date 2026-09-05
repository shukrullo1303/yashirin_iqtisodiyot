import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { Add, Delete, Edit, Hub } from '@mui/icons-material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'

type Location = { id: number; name: string }
type Gateway = {
  id: number; location: number; location_name: string; name: string; host: string
  channel_count: number; vpn_connected: boolean; status: 'online' | 'offline' | 'warning'
  last_heartbeat?: string | null; notes: string
}
type FormValues = Omit<Gateway, 'id' | 'location_name' | 'last_heartbeat'>
const emptyForm: FormValues = { location: 0, name: '', host: '', channel_count: 8, vpn_connected: false, status: 'offline', notes: '' }

const errorMessage = (error: any) => {
  const data = error?.response?.data
  if (typeof data?.detail === 'string') return data.detail
  if (data && typeof data === 'object') {
    const [field, value] = Object.entries(data)[0] || []
    if (Array.isArray(value)) return `${field}: ${value[0]}`
  }
  return error?.message || 'Xatolik yuz berdi'
}

const formatTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value))
  : 'Hali aloqa bo‘lmagan'

export default function NvrGateways() {
  const client = useQueryClient()
  const [opened, setOpened] = useState(false)
  const [current, setCurrent] = useState<Gateway | null>(null)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const gateways = useQuery<Gateway[]>('nvr-gateways', async () => (await apiClient.get('nvr-gateways/')).data)
  const locations = useQuery<Location[]>('locations', async () => (await apiClient.get('locations/')).data)

  const save = useMutation<any, any, FormValues>((payload) => current
    ? apiClient.put(`nvr-gateways/${current.id}/`, payload)
    : apiClient.post('nvr-gateways/', payload), {
    onSuccess: () => { toast.success(current ? 'Gateway yangilandi' : 'Gateway qo‘shildi'); client.invalidateQueries('nvr-gateways'); close() },
    onError: (error) => { toast.error(errorMessage(error)) },
  })
  const remove = useMutation<void, any, number>((id) => apiClient.delete(`nvr-gateways/${id}/`), {
    onSuccess: () => { toast.success('Gateway o‘chirildi'); client.invalidateQueries('nvr-gateways') },
    onError: (error) => { toast.error(errorMessage(error)) },
  })
  const usedLocationIds = new Set((gateways.data || []).filter((item) => item.id !== current?.id).map((item) => item.location))
  const availableLocations = (locations.data || []).filter((item) => !usedLocationIds.has(item.id))

  const open = (gateway?: Gateway) => {
    setCurrent(gateway || null)
    setForm(gateway ? {
      location: gateway.location, name: gateway.name, host: gateway.host, channel_count: gateway.channel_count,
      vpn_connected: gateway.vpn_connected, status: gateway.status, notes: gateway.notes || '',
    } : emptyForm)
    setOpened(true)
  }
  const close = () => { setOpened(false); setCurrent(null); setForm(emptyForm) }
  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = event.target
    setForm((old) => ({ ...old, [name]: name === 'vpn_connected' ? checked : name === 'location' || name === 'channel_count' ? Number(value) : value }))
  }
  if (gateways.isLoading || locations.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
  if (gateways.isError || locations.isError) return <Alert severity="error">NVR ma’lumotlarini yuklab bo‘lmadi.</Alert>

  return <Box>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
      <Box><Typography variant="h4"><Hub sx={{ mr: 1, verticalAlign: 'middle' }} />NVR va AI gatewaylar</Typography><Typography color="text.secondary">Har bir lokatsiyani markaziy serverga xavfsiz VPN orqali ulash reyestri.</Typography></Box>
      <Button variant="contained" startIcon={<Add />} onClick={() => open()}>Gateway qo‘shish</Button>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>Kamera RTSP manzillari shu NVR yoki lokal AI gateway orqali uzatiladi. Internetdan ochiq port bermang; VPN yoki himoyalangan tunnel ishlating.</Alert>
    <TableContainer component={Paper}><Table><TableHead><TableRow>
      <TableCell>Lokatsiya</TableCell><TableCell>Gateway / VPN manzil</TableCell><TableCell align="center">Kanallar</TableCell><TableCell>VPN</TableCell><TableCell>Holat</TableCell><TableCell>Oxirgi aloqa</TableCell><TableCell align="right">Amallar</TableCell>
    </TableRow></TableHead><TableBody>{(gateways.data || []).map((gateway) => <TableRow key={gateway.id} hover>
      <TableCell><Typography fontWeight={700}>{gateway.location_name}</Typography></TableCell>
      <TableCell><Typography fontWeight={700}>{gateway.name}</Typography><Typography variant="caption" color="text.secondary">{gateway.host}</Typography></TableCell>
      <TableCell align="center">{gateway.channel_count}</TableCell>
      <TableCell><Chip size="small" color={gateway.vpn_connected ? 'success' : 'default'} label={gateway.vpn_connected ? 'Ulangan' : 'Ulanmagan'} /></TableCell>
      <TableCell><Chip size="small" color={gateway.status === 'online' ? 'success' : gateway.status === 'warning' ? 'warning' : 'error'} label={gateway.status === 'online' ? 'Online' : gateway.status === 'warning' ? 'Ogohlantirish' : 'Offline'} /></TableCell>
      <TableCell>{formatTime(gateway.last_heartbeat)}</TableCell>
      <TableCell align="right"><IconButton title="Tahrirlash" onClick={() => open(gateway)}><Edit /></IconButton><IconButton color="error" title="O‘chirish" onClick={() => window.confirm(`${gateway.name} gatewayini o‘chirasizmi?`) && remove.mutate(gateway.id)}><Delete /></IconButton></TableCell>
    </TableRow>)}{!gateways.data?.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>Hali NVR yoki gateway kiritilmagan.</TableCell></TableRow>}</TableBody></Table></TableContainer>
    <Dialog open={opened} onClose={close} fullWidth maxWidth="sm" component="form" onSubmit={(event: React.FormEvent) => { event.preventDefault(); save.mutate(form) }}>
      <DialogTitle>{current ? 'Gatewayni tahrirlash' : 'Yangi NVR / AI gateway'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField select required label="Lokatsiya" name="location" value={form.location || ''} onChange={change} helperText="Bitta lokatsiyaga bitta gateway biriktiriladi.">{availableLocations.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}</TextField>
        <TextField required label="Gateway nomi" name="name" value={form.name} onChange={change} placeholder="Masalan: Asaka-1 NVR" />
        <TextField required label="VPN IP yoki hostname" name="host" value={form.host} onChange={change} placeholder="10.8.0.12 yoki nvr-asaka-1" />
        <TextField required type="number" inputProps={{ min: 1, max: 256 }} label="Kamera kanallari" name="channel_count" value={form.channel_count} onChange={change} />
        <TextField select label="Joriy holat" name="status" value={form.status} onChange={change}><MenuItem value="online">Online</MenuItem><MenuItem value="warning">Ogohlantirish</MenuItem><MenuItem value="offline">Offline</MenuItem></TextField>
        <FormControlLabel control={<Switch checked={form.vpn_connected} name="vpn_connected" onChange={change} />} label="VPN / himoyalangan tunnel ulangan" />
        <TextField multiline minRows={3} label="Izoh" name="notes" value={form.notes} onChange={change} />
      </Stack></DialogContent><DialogActions><Button onClick={close}>Bekor qilish</Button><Button type="submit" variant="contained" disabled={save.isLoading}>{save.isLoading ? 'Saqlanmoqda...' : 'Saqlash'}</Button></DialogActions>
    </Dialog>
  </Box>
}
