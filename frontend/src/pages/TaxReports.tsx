import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Add, Delete, Edit } from '@mui/icons-material'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import toast from 'react-hot-toast'
import apiClient from '../api/client'
import { asList } from '../utils/asList'
import { useAuthStore } from '../store/authStore'

type Location = { id: number; name: string }
type TaxReport = { id: number; location: number; location_name: string; report_period: string; report_period_type: 'daily' | 'monthly'; reported_revenue: number; tax_paid: number; crm_calculated_tax?: number; entered_by_name?: string; last_sync?: string }
type TaxSummary = { totals?: { total_tax_paid?: number; estimated_tax_due?: number; tax_gap?: number }; tax_rate?: number; locations?: { location_id: number; crm_order_revenue?: number; estimated_tax_due?: number }[] }
const today = new Date().toISOString().slice(0, 10)

export default function TaxReports() {
  const { user } = useAuthStore()
  const isSuperadmin = Boolean((user as any)?.is_superuser)
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TaxReport | null>(null)
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const [startDate, setStartDate] = useState(monthStart)
  const [endDate, setEndDate] = useState(today)
  const [form, setForm] = useState({ location: '', report_period: today, report_period_type: 'daily', reported_revenue: '', tax_paid: '' })
  const reportsQuery = useQuery<unknown>('tax-reports', async () => (await apiClient.get('tax-integrations/')).data)
  const summaryQuery = useQuery<TaxSummary>('tax-dashboard-summary', async () => (await apiClient.get('dashboard/stats/')).data, { refetchInterval: 30000 })
  const locationsQuery = useQuery<unknown>('tax-report-locations', async () => (await apiClient.get('locations/')).data)
  const reports = asList<TaxReport>(reportsQuery.data).filter((row) => row.report_period)
  const visibleReports = reports.filter((row) => {
    const period = row.report_period
    const from = startDate ? startDate.slice(0, 10) : ''
    const to = endDate ? endDate.slice(0, 10) : ''
    return (!from || period >= from) && (!to || period <= to)
  })
  const locations = asList<Location>(locationsQuery.data)
  const taxTotals = summaryQuery.data?.totals || {}
  const crmTaxByLocation = new Map((summaryQuery.data?.locations || []).map((row) => [row.location_id, Number(row.estimated_tax_due || 0)]))
  const crmRevenueByLocation = new Map((summaryQuery.data?.locations || []).map((row) => [row.location_id, Number(row.crm_order_revenue || 0)]))
  const save = useMutation(() => {
    const period = form.report_period_type === 'monthly' && /^\d{4}-\d{2}$/.test(form.report_period) ? `${form.report_period}-01` : form.report_period
    const payload = { ...form, report_period: period, location: Number(form.location), reported_revenue: Number(form.reported_revenue || 0), tax_paid: Number(form.tax_paid || 0) }
    return editing ? apiClient.patch(`tax-integrations/${editing.id}/`, payload) : apiClient.post('tax-integrations/', payload)
  }, { onSuccess: () => { toast.success('Soliq ma’lumoti saqlandi'); client.invalidateQueries('tax-reports'); setOpen(false); setEditing(null) }, onError: (e: any) => { toast.error(e?.response?.data?.detail || 'Ma’lumot saqlanmadi') } })
  const remove = useMutation((id: number) => apiClient.delete(`tax-integrations/${id}/`), { onSuccess: () => { toast.success('Soliq yozuvi o‘chirildi'); client.invalidateQueries('tax-reports') }, onError: (e: any) => { toast.error(e?.response?.data?.detail || 'O‘chirishga ruxsat yo‘q') } })
  const openForm = (row?: TaxReport) => { setEditing(row || null); setForm(row ? { location: String(row.location), report_period: row.report_period_type === 'monthly' ? row.report_period.slice(0, 7) : row.report_period, report_period_type: row.report_period_type, reported_revenue: String(row.reported_revenue), tax_paid: String(row.tax_paid) } : { location: '', report_period: today, report_period_type: 'daily', reported_revenue: '', tax_paid: '' }); setOpen(true) }
  const exportExcel = () => { const rows = [['Lokatsiya', 'Davr', 'Sana', 'Rasmiy tushum', 'CRM tushumi', 'CRM hisoblagan soliq', 'To‘langan soliq'], ...visibleReports.map((r) => [r.location_name, r.report_period_type === 'monthly' ? 'Oylik' : 'Kunlik', r.report_period, r.reported_revenue, crmRevenueByLocation.get(r.location) || 0, r.crm_calculated_tax || crmTaxByLocation.get(r.location) || 0, r.tax_paid])]; const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'soliq_hisoboti.csv'; a.click(); URL.revokeObjectURL(a.href) }
  return <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}><Box><Typography variant="h4">Soliq ma’lumotlari</Typography><Typography color="text.secondary">CRM hisoblangan soliq hamda soliqchi kiritgan to‘lovlarni davr bo‘yicha solishtiring.</Typography></Box><Box sx={{ display: 'flex', gap: 1 }}><Button variant="outlined" onClick={exportExcel}>Excel</Button><Button variant="outlined" onClick={() => window.print()}>PDF / Chop etish</Button><Button variant="contained" startIcon={<Add />} onClick={() => openForm()}>Ma’lumot kiritish</Button></Box></Box>
    <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}><Typography fontWeight={700}>Hisobot davri:</Typography><TextField size="small" type="date" label="Boshlanish sanasi" InputLabelProps={{ shrink: true }} value={startDate} onChange={(e) => setStartDate(e.target.value)} /><TextField size="small" type="date" label="Tugash sanasi" InputLabelProps={{ shrink: true }} value={endDate} onChange={(e) => setEndDate(e.target.value)} /><Button size="small" onClick={() => { setStartDate(''); setEndDate('') }}>Barchasi</Button><Typography variant="caption" color="text.secondary">{visibleReports.length} ta yozuv</Typography></Paper>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
      {[
        ['To‘langan soliq', Number(taxTotals.total_tax_paid || 0), 'Soliqchi kiritgan tasdiqlangan summa', '#2e7d32'],
        ['Hisoblangan soliq', Number(taxTotals.estimated_tax_due || 0), `CRM zakazlari × ${Number(summaryQuery.data?.tax_rate || 0.12) * 100}% nazorat stavkasi`, '#1565c0'],
        ['Soliq tafovuti', Number(taxTotals.tax_gap || 0), 'Hisoblangan va to‘langan summa farqi', Number(taxTotals.tax_gap || 0) > 0 ? '#c62828' : '#2e7d32'],
      ].map(([label, value, caption, color]) => <Paper key={String(label)} sx={{ p: 2, borderTop: 4, borderColor: color }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ color, fontWeight: 800 }}>{Number(value).toLocaleString()} so‘m</Typography><Typography variant="caption" color="text.secondary">{caption}</Typography></Paper>)}
    </Box>
    <Paper sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary">Hisoblangan soliq CRMdagi to‘langan zakazlar asosidagi nazorat ko‘rsatkichi. Bu rasmiy soliq qarori emas; rasmiy summa soliqchi tomonidan kiritiladi.</Typography></Paper>
    <Paper sx={{ overflowX: 'auto' }}><Table><TableHead><TableRow><TableCell>Lokatsiya</TableCell><TableCell>Davr</TableCell><TableCell>Sana</TableCell><TableCell align="right">Rasmiy tushum</TableCell><TableCell align="right">CRM tushumi</TableCell><TableCell align="right">CRM hisoblagan soliq</TableCell><TableCell align="right">To‘langan soliq</TableCell><TableCell>Kiritgan</TableCell><TableCell>Amal</TableCell></TableRow></TableHead><TableBody>{visibleReports.map((row) => { const crmTax = Number(row.crm_calculated_tax || crmTaxByLocation.get(row.location) || 0); const crmRevenue = Number(crmRevenueByLocation.get(row.location) || 0); return <TableRow key={row.id}><TableCell>{row.location_name}</TableCell><TableCell>{row.report_period_type === 'monthly' ? 'Oylik' : 'Kunlik'}</TableCell><TableCell>{row.report_period_type === 'monthly' ? `${row.report_period.slice(0, 7).replace('-', '.')} oy` : row.report_period.split('-').reverse().join('.')}</TableCell><TableCell align="right">{Number(row.reported_revenue).toLocaleString()} so‘m</TableCell><TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>{crmRevenue.toLocaleString()} so‘m</TableCell><TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>{crmTax.toLocaleString()} so‘m</TableCell><TableCell align="right">{Number(row.tax_paid).toLocaleString()} so‘m</TableCell><TableCell>{row.entered_by_name || '—'}</TableCell><TableCell><Button size="small" startIcon={<Edit />} onClick={() => openForm(row)}>Tahrirlash</Button>{isSuperadmin && <Button size="small" color="error" startIcon={<Delete />} onClick={() => { if (window.confirm('Soliq yozuvini o‘chirasizmi?')) remove.mutate(row.id) }}>O‘chirish</Button>}</TableCell></TableRow>})}{!visibleReports.length && <TableRow><TableCell colSpan={9} align="center">Tanlangan davrda soliq ma’lumoti topilmadi.</TableCell></TableRow>}</TableBody></Table></Paper>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Soliq yozuvini tahrirlash' : 'Soliq ma’lumotini kiritish'}</DialogTitle><DialogContent><TextField select fullWidth margin="dense" label="Lokatsiya" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>{locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}</TextField><TextField select fullWidth margin="dense" label="Hisobot davri" value={form.report_period_type} onChange={(e) => { const type = e.target.value as 'daily' | 'monthly'; setForm({ ...form, report_period_type: type, report_period: type === 'monthly' ? form.report_period.slice(0, 7) : (form.report_period.length === 7 ? `${form.report_period}-01` : form.report_period) }) }}><MenuItem value="daily">Kunlik</MenuItem><MenuItem value="monthly">Oylik</MenuItem></TextField><TextField fullWidth margin="dense" type={form.report_period_type === 'monthly' ? 'month' : 'date'} label={form.report_period_type === 'monthly' ? 'Oy' : 'Sana'} InputLabelProps={{ shrink: true }} value={form.report_period} onChange={(e) => setForm({ ...form, report_period: e.target.value })}/><TextField fullWidth margin="dense" type="number" label="Rasmiy tushum (so‘m)" value={form.reported_revenue} onChange={(e) => setForm({ ...form, reported_revenue: e.target.value })}/><TextField fullWidth margin="dense" type="number" label="To‘langan soliq (so‘m)" value={form.tax_paid} onChange={(e) => setForm({ ...form, tax_paid: e.target.value })}/></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Bekor qilish</Button><Button variant="contained" disabled={!form.location || save.isLoading} onClick={() => save.mutate()}>Saqlash</Button></DialogActions></Dialog>
  </Box>
}
