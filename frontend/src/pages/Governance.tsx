import { useQuery } from 'react-query'
import { Alert, Box, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import apiClient from '../api/client'

const format = (value: string) => new Date(value).toLocaleString('uz-UZ', { day: 'numeric', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(',', '')
export default function Governance() {
  const audit = useQuery<any[]>('audit-logs', async () => (await apiClient.get('audit-logs/')).data)
  const notices = useQuery<any[]>('notifications', async () => (await apiClient.get('notifications/')).data, { refetchInterval: 30000 })
  return <Box><Typography variant="h4" sx={{ mb: 3 }}>Nazorat jurnali</Typography><Box sx={{ display: 'grid', gap: 1, mb: 3 }}>{(notices.data || []).filter((n) => !n.is_read).map((n) => <Alert key={n.id} severity={n.level === 'error' ? 'error' : n.level === 'warning' ? 'warning' : 'info'}>{n.location_name && `${n.location_name}: `}{n.title} — {n.message}</Alert>)}{!(notices.data || []).length && <Alert severity="success">Faol ogohlantirishlar yo‘q.</Alert>}</Box><Paper sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>Vaqt</TableCell><TableCell>Kim</TableCell><TableCell>Amal</TableCell><TableCell>Obyekt</TableCell><TableCell>Lokatsiya</TableCell><TableCell>Izoh</TableCell></TableRow></TableHead><TableBody>{(audit.data || []).map((row) => <TableRow key={row.id}><TableCell>{format(row.created_at)}</TableCell><TableCell>{row.actor_name}</TableCell><TableCell><Chip size="small" label={row.action}/></TableCell><TableCell>{row.entity_type}</TableCell><TableCell>{row.location_name || '—'}</TableCell><TableCell>{row.summary}</TableCell></TableRow>)}{!(audit.data || []).length && <TableRow><TableCell colSpan={6} align="center">Audit yozuvi yo‘q.</TableCell></TableRow>}</TableBody></Table></Paper></Box>
}
