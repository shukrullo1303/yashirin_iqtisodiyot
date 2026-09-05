import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { orderApi, tableApi, roomApi, staffApi, menuApi, analyticsApi } from '../../api/cafe'
import apiClient from '../../api/client'

// ── Types ──────────────────────────────────────────────────────────────────────
interface OrderItem { menu_item_name: string; quantity: number }
interface OrderT { id: number; table_name: string; waiter_name: string; status: string; total: string; opened_at: string; order_type: string; items: OrderItem[] }
interface TableStatus { has_open_order: boolean; order_id: number | null; item_count: number }
interface TableT { id: number; location: number; room?: number | null; room_name?: string; number: number; name: string; capacity: number; position_x?: number; position_y?: number; width?: number; height?: number; shape?: string; status: TableStatus }
interface RoomT { id: number; location: number; name: string; width: number; height: number; position_x?: number; position_y?: number }
interface StaffT { id: number; username: string; full_name: string; role: string; is_active: boolean; date_joined: string }
interface AiEmployeeT { id: number; full_name: string; position?: string; jshshir?: string; monitoring_id?: string; location_name?: string; latest_image_path?: string; is_verified?: boolean; is_registered?: boolean }
interface MenuItemT { id: number; category?: number; name: string; description?: string; price: string; image_url?: string | null; is_available: boolean; order?: number }
interface CategoryT { id: number; location?: number; name: string; order?: number; items: MenuItemT[] }
interface AnalyticsT {
  total_orders: number
  total_revenue: number
  peak_hours: { hour: number; count: number }[]
  popular_items: { menu_item__name: string; total_qty: number; total_revenue: number }[]
  daily_revenue: { date: string; revenue: number }[]
  order_type_breakdown: { order_type: string; count: number }[]
  weekly_pattern: { weekday: number; count: number }[]
}
interface TaxSummaryT {
  totals?: { total_tax_paid?: number; estimated_tax_due?: number; tax_gap?: number }
  tax_rate?: number
}

type Page = 'dashboard' | 'orders' | 'tables' | 'staff' | 'menu' | 'reports' | 'inventory'

// ── Helpers ────────────────────────────────────────────────────────────────────
const sc = (s: string) => ({ open: '#7c6ff7', ready: '#e8a820', paid: '#2d9e6b', cancelled: '#d94545' }[s] || '#9a7060')
const sl = (s: string) => ({ open: 'Jarayonda', ready: 'Tayyor', paid: "To'langan", cancelled: 'Bekor' }[s] || s)
const rl = (r: string) => ({ waiter: 'Ofitsiant', cafe_manager: 'Menejer', kitchen: 'Oshpaz', cashier: 'Kassir', business_owner: 'Egasi' }[r] || r)
const DAYS = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh']

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = filename + '.csv'
  a.click()
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
function LineChart({ data, color = '#c8601a' }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data || data.length < 2) return <div style={{ color: 'var(--subtext)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Ma'lumot yo'q</div>
  const W = 500, H = 120, px = 8, py = 14
  const maxV = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => ({ x: px + (i / (data.length - 1)) * (W - px * 2), y: py + (1 - d.value / maxV) * (H - py * 2) }))
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${pts[0].x},${H - py} ${polyline} ${pts[pts.length - 1].x},${H - py}`
  const gradId = `grad_${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color} />)}
    </svg>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoGrid   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const IcoList   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
const IcoTable  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="4" rx="1"/><line x1="6" y1="12" x2="6" y2="17"/><line x1="18" y1="12" x2="18" y2="17"/><line x1="4" y1="19" x2="20" y2="19"/></svg>
const IcoUsers  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const IcoMenu   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const IcoChart  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>
const IcoBox    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
const IcoLogout = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const IcoPlus   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoKey    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="4"/><line x1="10.24" y1="10.24" x2="21" y2="21"/><line x1="18" y1="18" x2="21" y2="21"/><line x1="18" y1="21" x2="21" y2="18"/></svg>
const IcoTrash  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IcoDown   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcoRefresh = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>

const NAV = [
  { id: 'dashboard' as Page, label: 'Bosh sahifa',   Icon: IcoGrid   },
  { id: 'orders'    as Page, label: 'Buyurtmalar',   Icon: IcoList   },
  { id: 'tables'    as Page, label: 'Stollar',        Icon: IcoTable  },
  { id: 'staff'     as Page, label: 'Xodimlar',       Icon: IcoUsers  },
  { id: 'menu'      as Page, label: 'Menyu',          Icon: IcoMenu   },
  { id: 'reports'   as Page, label: 'Hisobotlar',     Icon: IcoChart  },
  { id: 'inventory' as Page, label: 'Inventar',       Icon: IcoBox    },
]

// ── Reusable Badge ─────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const c = sc(status)
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:c+'22', color:c, border:`1px solid ${c}44` }}>
      <span style={{ width:6, height:6, borderRadius:3, background:c, display:'inline-block' }} />{sl(status)}
    </span>
  )
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={onClose}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:32, width:420, maxWidth:'92vw', maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h3 style={{ fontWeight:800, fontSize:17 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'var(--border)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', color:'var(--text)', fontSize:16, fontFamily:'Nunito', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const INP: React.CSSProperties = { width:'100%', padding:'11px 14px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Nunito', fontSize:14, outline:'none', boxSizing:'border-box' }
const SEL: React.CSSProperties = { ...INP, appearance:'none' }

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ active, onNav, onLogout, liveCount }: { active: Page; onNav: (p: Page) => void; onLogout: () => void; liveCount: number }) {
  const [hov, setHov] = useState<Page | null>(null)
  return (
    <div style={{ width:220, minHeight:'100vh', background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'0 0 24px 0', position:'fixed', top:0, left:0, bottom:0, zIndex:10 }}>
      <div style={{ padding:'22px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg, var(--accent) 0%, var(--gold) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>☕</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.3px' }}>CAFE CRM</div>
            <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:600 }}>Boss Panel</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:'14px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(({ id, label, Icon }) => {
          const isActive = active === id
          const isHov = hov === id
          const showBadge = id === 'orders' && liveCount > 0
          return (
            <button key={id} onClick={() => onNav(id)} onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background: isActive ? 'var(--accent)' : isHov ? 'var(--card2)' : 'transparent', color: isActive ? '#fff' : isHov ? 'var(--text)' : 'var(--subtext)', border:'none', cursor:'pointer', fontFamily:'Nunito', fontSize:14, fontWeight: isActive ? 700 : 500, transition:'all 0.13s', textAlign:'left', width:'100%', position:'relative' }}>
              <Icon />{label}
              {showBadge && <span style={{ marginLeft:'auto', background:'#d94545', color:'#fff', borderRadius:9, minWidth:18, height:18, fontSize:11, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{liveCount}</span>}
            </button>
          )
        })}
      </nav>
      <button onClick={onLogout} style={{ margin:'0 10px', padding:'10px 12px', borderRadius:10, background:'transparent', border:'1px solid var(--border)', color:'var(--subtext)', cursor:'pointer', fontFamily:'Nunito', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
        <IcoLogout />Chiqish
      </button>
    </div>
  )
}

// ── Dashboard home ─────────────────────────────────────────────────────────────
function HomePage({ analytics, orders, taxSummary }: { analytics: AnalyticsT | null; orders: OrderT[]; taxSummary: TaxSummaryT | null }) {
  if (!analytics) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Yuklanmoqda…</div>
  const maxPeak = Math.max(...(analytics.peak_hours?.map(h => h.count) ?? [1]), 1)
  const liveOpen = orders.filter(o => o.status === 'open').length
  const paidTax = Number(taxSummary?.totals?.total_tax_paid || 0)
  const taxRate = Number(taxSummary?.tax_rate || 0.12)
  const estimatedTax = Number(taxSummary?.totals?.estimated_tax_due || 0) || Number(analytics.total_revenue || 0) * taxRate
  const taxGap = estimatedTax - paidTax
  const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " so'm"
  const stats = [
    { label:'Jami daromad', value: Number(analytics.total_revenue).toLocaleString() + " so'm", icon:'💰', color:'#d4621e' },
    { label:'Jami buyurtmalar', value: String(analytics.total_orders), icon:'📋', color:'#e8a820' },
    { label:'O‘rtacha zakaz', value: analytics.total_orders ? (Number(analytics.total_revenue) / analytics.total_orders).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " so'm" : '—', icon:'🧾', color:'#7c6ff7' },
    { label:'Hozir jarayonda', value: String(liveOpen), icon:'🔥', color:'#d94545' },
    { label:'To‘langan soliq', value: money(paidTax), icon:'✅', color:'#2d9e6b' },
    { label:'Hisoblangan soliq', value: money(estimatedTax), icon:'🧮', color:'#3788d8' },
    { label:'Soliq tafovuti', value: money(taxGap), icon:'⚖️', color: taxGap > 0 ? '#d94545' : '#2d9e6b' },
    { label:'Top taom', value: analytics.popular_items?.[0]?.menu_item__name || '—', icon:'🍽️', color:'#2d9e6b' },
  ]
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{s.label}</div>
                <div style={{ fontSize:18, fontWeight:800, lineHeight:1.2 }}>{s.value}</div>
              </div>
              <div style={{ width:40, height:40, borderRadius:12, background:s.color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:-8, marginBottom:20, color:'var(--subtext)', fontSize:12 }}>
        Hisoblangan soliq — CRMdagi to‘langan zakazlar asosida nazorat hisobi (sozlangan stavka {taxRate * 100}%); bu rasmiy soliq hisoboti emas.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:14, marginBottom:20 }}>
        {(analytics.peak_hours?.length ?? 0) > 0 && (
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:20 }}>Eng band soatlar</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:110 }}>
              {analytics.peak_hours.map((d, i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:10, color:'var(--subtext)', fontWeight:700 }}>{d.count}</div>
                  <div style={{ width:'100%', borderRadius:'4px 4px 0 0', height:`${(d.count/maxPeak)*90}px`, background:'var(--accent)', transition:'height 0.4s' }} />
                  <div style={{ fontSize:9, color:'var(--subtext)', fontWeight:700 }}>{d.hour}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(analytics.popular_items?.length ?? 0) > 0 && (
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Top taomlar</div>
            {analytics.popular_items.slice(0,5).map((d,i) => {
              const maxQ = analytics.popular_items[0].total_qty
              return (
                <div key={i} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{d.menu_item__name}</span>
                    <span style={{ fontSize:12, color:'var(--subtext)' }}>{d.total_qty} ta</span>
                  </div>
                  <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                    <div style={{ height:5, width:`${(d.total_qty/maxQ)*100}%`, background:'var(--accent)', borderRadius:3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>So'nggi buyurtmalar</div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['#','Stol','Ofitsiant','Mahsulot','Summa','Holat','Vaqt'].map(h => (
                <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--subtext)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.slice(0,6).map((o,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'11px 10px', fontSize:13, fontWeight:700, color:'var(--accent)' }}>#{o.id}</td>
                <td style={{ padding:'11px 10px', fontSize:13 }}>{o.table_name}</td>
                <td style={{ padding:'11px 10px', fontSize:13, color:'var(--subtext)' }}>{o.waiter_name}</td>
                <td style={{ padding:'11px 10px', fontSize:13 }}>{o.items.length} ta</td>
                <td style={{ padding:'11px 10px', fontSize:13, fontWeight:700 }}>{Number(o.total).toLocaleString()} so'm</td>
                <td style={{ padding:'11px 10px' }}><Badge status={o.status} /></td>
                <td style={{ padding:'11px 10px', fontSize:13, color:'var(--subtext)' }}>{new Date(o.opened_at).toLocaleTimeString('uz',{hour:'2-digit',minute:'2-digit'})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Orders page ────────────────────────────────────────────────────────────────
function OrdersPage({ orders, refresh }: { orders: OrderT[]; refresh: () => void }) {
  const [filter, setFilter] = useState('Hammasi')
  const statusNext: Record<string,string> = { open:'ready', ready:'paid' }
  const btnLabel: Record<string,string> = { open:'Tayyor', ready:"To'lash" }
  const advance = async (id: number, status: string) => {
    if (!statusNext[status]) return
    try { await orderApi.updateStatus(id, statusNext[status]); refresh() } catch {}
  }
  const FILTERS = ['Hammasi','Jarayonda','Tayyor',"To'langan"]
  const filtered = orders.filter(o => {
    if (filter==='Jarayonda') return o.status==='open'
    if (filter==='Tayyor') return o.status==='ready'
    if (filter==="To'langan") return o.status==='paid'
    return true
  })
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:18, alignItems:'center' }}>
        {FILTERS.map(f => <button key={f} onClick={()=>setFilter(f)} style={{ padding:'7px 15px', borderRadius:20, fontSize:13, fontWeight:600, background:filter===f?'var(--accent)':'var(--card)', color:filter===f?'#fff':'var(--subtext)', border:'1px solid var(--border)', cursor:'pointer', fontFamily:'Nunito', transition:'all 0.13s' }}>{f}</button>)}
        <span style={{ marginLeft:'auto', fontSize:13, color:'var(--subtext)' }}>{filtered.length} ta</span>
        <button onClick={refresh} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}><IcoRefresh />Yangilash</button>
        <button onClick={() => downloadCSV([['#','Stol','Ofitsiant','Summa','Holat','Vaqt'], ...filtered.map(o=>[o.id,o.table_name,o.waiter_name,o.total,sl(o.status),new Date(o.opened_at).toLocaleString()])], 'buyurtmalar')} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}><IcoDown />Excel</button>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Buyurtma yo'q</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
          {filtered.map(o => (
            <div key={o.id} style={{ background:'var(--card)', border:`1px solid ${sc(o.status)}33`, borderRadius:16, padding:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontWeight:800, fontSize:15, color:'var(--accent)' }}>#{o.id}</span>
                  <span style={{ fontSize:14, fontWeight:700 }}>{o.table_name}</span>
                </div>
                <Badge status={o.status} />
              </div>
              <div style={{ marginBottom:14, background:'var(--card2)', borderRadius:10, padding:'10px 12px' }}>
                {o.items.map((item,i) => <div key={i} style={{ fontSize:13, padding:'2px 0' }}>{item.menu_item_name} × {item.quantity}</div>)}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>{Number(o.total).toLocaleString()} so'm</div>
                  <div style={{ fontSize:11, color:'var(--subtext)', marginTop:2 }}>{o.waiter_name} · {new Date(o.opened_at).toLocaleTimeString('uz',{hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                {statusNext[o.status] && (
                  <button onClick={() => advance(o.id, o.status)} style={{ padding:'9px 18px', background:sc(o.status), color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}>{btnLabel[o.status]}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tables page ────────────────────────────────────────────────────────────────
function TablesPage({ tables, rooms, refresh, refreshRooms }: { tables: TableT[]; rooms: RoomT[]; refresh: () => void; refreshRooms: () => void }) {
  const busy = tables.filter(t => t.status.has_open_order).length
  const free = tables.length - busy
  const [roomId, setRoomId] = useState<number | null>(rooms[0]?.id ?? null)
  const [roomDialog, setRoomDialog] = useState(false)
  const [tableDialog, setTableDialog] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const [roomName, setRoomName] = useState('Asosiy zal')
  const [tableForm, setTableForm] = useState({ number: '', name: '', capacity: '4' })
  const mapRef = React.useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (roomId === null && rooms.length) setRoomId(rooms[0].id)
  }, [rooms, roomId])
  const visibleTables = roomId ? tables.filter((table) => Number(table.room) === roomId) : tables
  const activeRoom = rooms.find((room) => room.id === roomId)
  const locationId = activeRoom?.location || tables[0]?.location
  const createRoom = async () => {
    if (!locationId || !roomName.trim()) return
    await roomApi.create({ location: locationId, name: roomName.trim(), width: 900, height: 560 })
    setRoomDialog(false); setRoomName(''); refreshRooms()
  }
  const createTable = async () => {
    if (!locationId) return
    try {
      await tableApi.create({ location: locationId, room: roomId, number: tableForm.number ? Number(tableForm.number) : undefined, name: tableForm.name, capacity: Number(tableForm.capacity), position_x: 60 + visibleTables.length * 84, position_y: 60 })
    } catch (error: any) {
      window.alert(error?.response?.data?.number?.[0] || error?.response?.data?.detail || 'Stolni qo‘shib bo‘lmadi')
      return
    }
    setTableDialog(false); setTableForm({ number: '', name: '', capacity: '4' }); refresh()
  }
  const removeTable = async (id: number) => { if (window.confirm('Bu stolni o‘chirasizmi?')) { await tableApi.delete(id); refresh() } }
  const removeRoom = async (id: number) => { if (window.confirm('Bu xona va uning xaritasini o‘chirasizmi?')) { await roomApi.delete(id); setRoomId(null); refreshRooms(); refresh() } }
  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        {[{label:'Band',val:busy,color:'#d4621e'},{label:"Bo'sh",val:free,color:'#2d9e6b'}].map((s,i) => (
          <div key={i} style={{ background:'var(--card)', border:`1px solid ${s.color}33`, borderRadius:14, padding:'14px 24px', textAlign:'center' }}>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--subtext)', fontWeight:600 }}>{s.label}</div>
          </div>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => setRoomDialog(true)} style={{ padding:'8px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', color:'var(--text)', fontFamily:'Nunito', fontSize:12, fontWeight:700 }}>+ Xona</button>
          <button onClick={() => setTableDialog(true)} disabled={!roomId} style={{ padding:'8px 14px', background:'var(--accent)', border:'none', borderRadius:10, cursor:'pointer', color:'#fff', fontFamily:'Nunito', fontSize:12, fontWeight:700 }}>+ Stol</button>
          <button onClick={() => { refresh(); refreshRooms() }} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}><IcoRefresh />Yangilash</button>
        </div>
      </div>
      <div ref={mapRef} style={{ minHeight:'calc(100vh - 170px)', border:'1px solid var(--border)', borderRadius:18, overflow:'auto', padding:18, backgroundColor:'var(--surface)', backgroundImage:'radial-gradient(circle at 20% 20%, rgba(84,183,255,.10), transparent 30%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize:'100% 100%, 32px 32px, 32px 32px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', color:'var(--subtext)', fontSize:11, fontWeight:800, letterSpacing:1, marginBottom:12 }}>
          <span>LOKATSIYA XARITASI · XONALAR VA STOLLAR</span>
          <div style={{ display:'flex', alignItems:'center', gap:6, letterSpacing:0 }}>
            <button onClick={() => setMapZoom(z => Math.max(.5, Number((z - .1).toFixed(1))))} title="Kichraytirish" style={{ width:30, height:28, border:'1px solid var(--border)', borderRadius:8, background:'var(--card)', color:'var(--text)', cursor:'pointer', fontSize:18, lineHeight:1 }}>−</button>
            <button onClick={() => setMapZoom(1)} title="Asl o‘lcham" style={{ minWidth:54, height:28, border:'1px solid var(--border)', borderRadius:8, background:'var(--card)', color:'var(--text)', cursor:'pointer', fontSize:11, fontWeight:700 }}>{Math.round(mapZoom * 100)}%</button>
            <button onClick={() => setMapZoom(z => Math.min(2, Number((z + .1).toFixed(1))))} title="Kattalashtirish" style={{ width:30, height:28, border:'1px solid var(--border)', borderRadius:8, background:'var(--card)', color:'var(--text)', cursor:'pointer', fontSize:18, lineHeight:1 }}>+</button>
          </div>
        </div>
        <div style={{ position:'relative', minHeight:980, minWidth:1000, zoom:mapZoom } as React.CSSProperties}>
        {rooms.map((room, roomIndex) => {
          const roomTables = tables.filter((table) => Number(table.room) === room.id)
          return <div key={room.id} draggable onClick={() => setRoomId(room.id)} onDragEnd={(event) => { const rect = mapRef.current?.getBoundingClientRect(); if (!rect) return; const x = Math.max(0, Math.round(event.clientX - rect.left - (room.width || 900) / 2)); const y = Math.max(0, Math.round(event.clientY - rect.top - 35)); roomApi.update(room.id, { position_x: x, position_y: y }).then(refreshRooms).catch(() => {}) }} onMouseUp={(event) => { if (event.target !== event.currentTarget) return; const node = event.currentTarget as HTMLDivElement; if (node.offsetWidth !== room.width || node.offsetHeight !== room.height) roomApi.update(room.id, { width: node.offsetWidth, height: node.offsetHeight }).then(refreshRooms).catch(() => {}) }} style={{ position:'absolute', left:room.position_x ?? (roomIndex % 2) * 460 + 10, top:room.position_y ?? Math.floor(roomIndex / 2) * 300, width:Math.max(420, room.width || 900), height:Math.max(260, room.height || 560), maxWidth:'none', resize:'both', overflow:'hidden', border:`2px solid ${room.id === roomId ? 'var(--accent)' : 'rgba(84,183,255,.45)'}`, borderRadius:16, background:'rgba(12,28,49,.48)', flexShrink:0 }}>
            <div style={{ position:'absolute', top:10, left:14, right:14, display:'flex', justifyContent:'space-between', alignItems:'center', color:'#54b7ff', fontSize:13, fontWeight:900 }}><span>{room.name}</span><button onClick={(event) => { event.stopPropagation(); removeRoom(room.id) }} style={{ border:0, background:'transparent', color:'var(--subtext)', cursor:'pointer', fontSize:16 }}>×</button></div>
            {roomTables.map(t => {
          const c = t.status.has_open_order ? '#d4621e' : '#2d9e6b'
          return (
            <div key={t.id} draggable={false} onPointerDown={(event) => { event.stopPropagation(); const parent = event.currentTarget.parentElement as HTMLElement; const rect = parent.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId); (event.currentTarget as any).__drag = { rect, offsetX: event.clientX - rect.left - (t.position_x ?? 40), offsetY: event.clientY - rect.top - (t.position_y ?? 60) } }} onPointerMove={(event) => { const state = (event.currentTarget as any).__drag; if (!state) return; const x = Math.max(8, Math.min(state.rect.width - 60, event.clientX - state.rect.left - state.offsetX)); const y = Math.max(42, Math.min(state.rect.height - 45, event.clientY - state.rect.top - state.offsetY)); event.currentTarget.style.left = `${x}px`; event.currentTarget.style.top = `${y}px` }} onPointerUp={(event) => { const state = (event.currentTarget as any).__drag; if (!state) return; const parent = event.currentTarget.parentElement as HTMLElement; const rect = parent.getBoundingClientRect(); const x = Math.max(8, Math.min(rect.width - 60, event.clientX - rect.left - state.offsetX)); const y = Math.max(42, Math.min(rect.height - 45, event.clientY - rect.top - state.offsetY)); delete (event.currentTarget as any).__drag; event.currentTarget.releasePointerCapture(event.pointerId); tableApi.update(t.id, { position_x: Math.round(x), position_y: Math.round(y) }).then(refresh).catch(() => {}) }} title={`${t.name || `Stol ${t.number}`} · ${t.capacity} o‘rin`} style={{ position:'absolute', left:t.position_x ?? 40, top:t.position_y ?? 60, width:t.width ?? 70, height:t.height ?? 48, minWidth:55, minHeight:40, resize:'both', overflow:'hidden', background:c+'22', border:`2px solid ${c}`, borderRadius:t.shape === 'round' ? '50%' : 8, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', cursor:'grab', touchAction:'none', userSelect:'none', transition:'box-shadow .15s', color:'var(--text)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor=c)}
              onMouseLeave={e => (e.currentTarget.style.borderColor=c+'33')}
              onMouseUp={(event) => { const target = event.currentTarget; if (target.offsetWidth !== (t.width ?? 70) || target.offsetHeight !== (t.height ?? 48)) tableApi.update(t.id, { width: target.offsetWidth, height: target.offsetHeight }).then(refresh).catch(() => {}) }}
            >
              <div style={{ fontSize:15, fontWeight:900, color:c }}>{t.number}</div>
              <div style={{ fontSize:9, color:'var(--subtext)' }}>{t.status.has_open_order ? `${t.status.item_count} ta zakaz` : `${t.capacity} o‘rin`}</div>
              <button onClick={(event) => { event.stopPropagation(); removeTable(t.id) }} title="Stolni o‘chirish" style={{ position:'absolute', top:-9, right:-9, width:18, height:18, borderRadius:'50%', border:'1px solid var(--border)', background:'var(--card)', color:'var(--subtext)', cursor:'pointer', fontSize:12, lineHeight:'14px' }}>×</button>
            </div>
          )
            })}
            {!roomTables.length && <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', color:'var(--subtext)', fontSize:14 }}>Bu xonada stol yo‘q.</div>}
          </div>
        })}
        {!rooms.length && <div style={{ display:'grid', placeItems:'center', minHeight:360, color:'var(--subtext)', fontSize:14 }}>“+ Xona” orqali birinchi xonani yarating.</div>}
        </div>
      </div>
      {roomDialog && <Modal title="Yangi xona yoki zal" onClose={() => setRoomDialog(false)}><div style={{ display:'flex', flexDirection:'column', gap:14 }}><input style={INP} placeholder="Masalan: Asosiy zal" value={roomName} onChange={e => setRoomName(e.target.value)} /><button onClick={createRoom} style={{ padding:12, background:'var(--accent)', color:'#fff', border:0, borderRadius:10, fontFamily:'Nunito', fontWeight:800 }}>Saqlash</button></div></Modal>}
      {tableDialog && <Modal title="Xona xaritasiga stol qo‘shish" onClose={() => setTableDialog(false)}><div style={{ display:'flex', flexDirection:'column', gap:14 }}><input style={INP} type="number" placeholder="Stol raqami (bo‘sh qoldirsa avtomatik)" value={tableForm.number} onChange={e => setTableForm({...tableForm, number:e.target.value})} /><input style={INP} placeholder="Stol nomi (ixtiyoriy)" value={tableForm.name} onChange={e => setTableForm({...tableForm, name:e.target.value})} /><input style={INP} type="number" min="1" placeholder="O‘rinlar soni" value={tableForm.capacity} onChange={e => setTableForm({...tableForm, capacity:e.target.value})} /><button onClick={createTable} style={{ padding:12, background:'var(--accent)', color:'#fff', border:0, borderRadius:10, fontFamily:'Nunito', fontWeight:800 }}>Xaritaga qo‘shish</button></div></Modal>}
    </div>
  )
}

// ── Staff page ─────────────────────────────────────────────────────────────────
function StaffPage({ staff, refresh }: { staff: StaffT[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPwd, setShowPwd] = useState<StaffT | null>(null)
  const [form, setForm] = useState({ username:'', full_name:'', role:'waiter', password:'' })
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiEmployees, setAiEmployees] = useState<AiEmployeeT[]>([])

  useEffect(() => {
    apiClient.get('employees/').then((response) => {
      const payload = response.data
      setAiEmployees(Array.isArray(payload) ? payload : (payload?.results ?? []))
    }).catch(() => setAiEmployees([]))
  }, [])

  const create = async () => {
    if (!form.username || !form.full_name || !form.password) { setErr("Barcha maydonlar to'ldirilishi shart"); return }
    setLoading(true); setErr('')
    try { await staffApi.create(form); await refresh(); setShowAdd(false); setForm({ username:'', full_name:'', role:'waiter', password:'' }) }
    catch (e: any) { setErr(e?.response?.data?.username?.[0] || e?.response?.data?.detail || 'Xatolik yuz berdi') }
    finally { setLoading(false) }
  }

  const toggle = async (id: number) => { try { await staffApi.toggleActive(id); refresh() } catch {} }
  const remove = async (id: number) => { if (!confirm("Xodimni o'chirishni tasdiqlaysizmi?")) return; try { await staffApi.delete(id); refresh() } catch {} }
  const changePass = async () => {
    if (!pwd || pwd.length < 4) { setErr('Parol kamida 4 belgidan iborat bo\'lishi kerak'); return }
    setLoading(true); setErr('')
    try { await staffApi.setPassword(showPwd!.id, pwd); setShowPwd(null); setPwd('') }
    catch { setErr('Parol o\'zgartirishda xatolik') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <span style={{ fontSize:14, color:'var(--subtext)' }}>Jami: <b style={{ color:'var(--text)' }}>{staff.length} ta xodim</b></span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => downloadCSV([['Ism','Login','Lavozim','Holat','Qo\'shilgan'], ...staff.map(s=>[s.full_name,s.username,rl(s.role),s.is_active?'Faol':'Nofaol',new Date(s.date_joined).toLocaleDateString()])], 'xodimlar')} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:13, fontWeight:600 }}><IcoDown />Excel</button>
          <button onClick={() => setShowAdd(true)} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}><IcoPlus />Xodim qo'shish</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {staff.map(s => {
          const c = s.is_active ? '#2d9e6b' : '#987060'
          return (
            <div key={s.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:46, height:46, borderRadius:14, background:'linear-gradient(135deg, var(--accent) 0%, var(--gold) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff', flexShrink:0 }}>
                  {(s.full_name||s.username)[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.full_name||s.username}</div>
                  <div style={{ fontSize:12, color:'var(--subtext)' }}>{rl(s.role)} · @{s.username}</div>
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <button onClick={() => toggle(s.id)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600, background:c+'22', color:c, border:`1px solid ${c}44`, cursor:'pointer', fontFamily:'Nunito' }}>
                  <span style={{ width:6, height:6, borderRadius:3, background:c, display:'inline-block' }} />
                  {s.is_active ? 'Faol' : 'Nofaol'}
                </button>
                <span style={{ fontSize:11, color:'var(--subtext)' }}>{new Date(s.date_joined).toLocaleDateString('uz')}</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => { setShowPwd(s); setPwd(''); setErr('') }} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}><IcoKey />Parol</button>
                <button onClick={() => remove(s.id)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px', background:'rgba(209,68,68,0.08)', border:'1px solid rgba(209,68,68,0.25)', borderRadius:8, cursor:'pointer', color:'#d94545', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}><IcoTrash />O'chirish</button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop:28, marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>AI kamera xodimlari</div>
          <div style={{ color:'var(--subtext)', fontSize:12, marginTop:4 }}>Soliqchi yoki administrator tasdiqlagan xodimlar. Yuz rasmi va doimiy kamera ID orqali taniladi.</div>
        </div>
        <span style={{ padding:'5px 12px', borderRadius:20, background:'#2d9e6b22', color:'#2d9e6b', border:'1px solid #2d9e6b44', fontSize:12, fontWeight:700 }}>{aiEmployees.length} ta</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {aiEmployees.map((employee) => (
          <div key={employee.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:16, display:'flex', gap:12, alignItems:'center' }}>
            {employee.latest_image_path ? <img src={`/media/${String(employee.latest_image_path).replace(/^\/+/, '')}`} alt={employee.full_name} style={{ width:58, height:58, borderRadius:14, objectFit:'cover', objectPosition:'center top', border:'2px solid #54b7ff' }} /> : <div style={{ width:58, height:58, borderRadius:14, display:'grid', placeItems:'center', background:'linear-gradient(135deg,#1769e0,#7249db)', color:'#fff', fontWeight:800, fontSize:20 }}>{employee.full_name?.[0] || '?'}</div>}
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{employee.full_name}</div>
              <div style={{ color:'var(--subtext)', fontSize:12 }}>{employee.position || 'Xodim'} · {employee.location_name || 'Lokatsiya'}</div>
              <div style={{ marginTop:5, fontSize:11, color:'#54b7ff' }}>ID: {employee.monitoring_id || `EMP-${employee.id}`} · JSHSHIR: {employee.jshshir || '—'}</div>
            </div>
          </div>
        ))}
        {!aiEmployees.length && <div style={{ gridColumn:'1/-1', color:'var(--subtext)', fontSize:13, padding:'18px 0' }}>Hozircha kamera xodimlari yo‘q.</div>}
      </div>

      {/* Add staff modal */}
      {showAdd && (
        <Modal title="Yangi xodim qo'shish" onClose={() => { setShowAdd(false); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>To'liq ism *</label>
              <input style={INP} placeholder="Aziz Karimov" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Login (username) *</label>
              <input style={INP} placeholder="aziz_karimov" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Lavozim *</label>
              <select style={SEL} value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="waiter">Ofitsiant</option>
                <option value="cafe_manager">Menejer</option>
                <option value="kitchen">Oshpaz</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Parol *</label>
              <input style={INP} type="password" placeholder="Kamida 4 belgi" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
            </div>
            {err && <div style={{ background:'rgba(209,68,68,0.1)', border:'1px solid rgba(209,68,68,0.3)', borderRadius:8, padding:'10px 14px', color:'#d94545', fontSize:13 }}>{err}</div>}
            <button onClick={create} disabled={loading} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {loading ? 'Saqlanmoqda…' : '+ Xodim qo\'shish'}
            </button>
          </div>
        </Modal>
      )}

      {/* Password modal */}
      {showPwd && (
        <Modal title={`Parol: ${showPwd.full_name}`} onClose={() => { setShowPwd(null); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <input style={INP} type="password" placeholder="Yangi parol (kamida 4 belgi)" value={pwd} onChange={e => setPwd(e.target.value)} />
            {err && <div style={{ background:'rgba(209,68,68,0.1)', border:'1px solid rgba(209,68,68,0.3)', borderRadius:8, padding:'10px 14px', color:'#d94545', fontSize:13 }}>{err}</div>}
            <button onClick={changePass} disabled={loading} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {loading ? 'Saqlanmoqda…' : 'Parolni o\'zgartirish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Menu page ──────────────────────────────────────────────────────────────────
function MenuPage({ categories, refresh }: { categories: CategoryT[]; refresh: () => void }) {
  const [categoryDialog, setCategoryDialog] = useState(false)
  const [itemDialog, setItemDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryT | null>(null)
  const [editingItem, setEditingItem] = useState<MenuItemT | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [itemForm, setItemForm] = useState<{ category: string; name: string; description: string; price: string; image: File | null }>({ category: '', name: '', description: '', price: '', image: null })
  const [busy, setBusy] = useState(false)
  const locationId = categories[0]?.location
  const total = categories.reduce((s,c) => s + c.items.length, 0)
  const openNewItem = (categoryId?: number) => { setEditingItem(null); setItemForm({ category: categoryId ? String(categoryId) : String(categories[0]?.id || ''), name:'', description:'', price:'', image:null }); setItemDialog(true) }
  const openEditItem = (item: MenuItemT) => { setEditingItem(item); setItemForm({ category: String(item.category || ''), name:item.name, description:item.description || '', price:String(item.price), image:null }); setItemDialog(true) }
  const saveCategory = async () => {
    if (!categoryName.trim() || !locationId) return
    setBusy(true)
    try { if (editingCategory) await menuApi.updateCategory(editingCategory.id, { name: categoryName.trim() }); else await menuApi.createCategory({ location: locationId, name: categoryName.trim() }); setCategoryDialog(false); setEditingCategory(null); setCategoryName(''); refresh() } finally { setBusy(false) }
  }
  const saveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price || !itemForm.category) return
    setBusy(true)
    try {
      const data = new FormData()
      data.append('category', String(Number(itemForm.category)))
      data.append('name', itemForm.name.trim())
      data.append('description', itemForm.description.trim())
      data.append('price', String(Number(itemForm.price)))
      if (itemForm.image) data.append('image', itemForm.image)
      if (editingItem) await menuApi.updateItem(editingItem.id, data)
      else await menuApi.createItem(data)
      setItemDialog(false); setEditingItem(null); refresh()
    } finally { setBusy(false) }
  }
  const removeCategory = async (category: CategoryT) => { if (category.items.length && !window.confirm('Bu kategoriyada taomlar bor. Kategoriyani o‘chirasizmi?')) return; if (!window.confirm('Kategoriyani o‘chirasizmi?')) return; await menuApi.deleteCategory(category.id); refresh() }
  const removeItem = async (item: MenuItemT) => { if (!window.confirm(`${item.name} taomini o‘chirasizmi?`)) return; await menuApi.deleteItem(item.id); refresh() }
  const toggleItem = async (item: MenuItemT) => { await menuApi.updateItem(item.id, { is_available: !item.is_available }); refresh() }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <span style={{ fontSize:14, color:'var(--subtext)' }}>Jami: <b style={{ color:'var(--text)' }}>{total} ta taom</b></span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => { setEditingCategory(null); setCategoryName(''); setCategoryDialog(true) }} style={{ padding:'9px 13px', border:'1px solid var(--border)', borderRadius:9, background:'var(--card)', color:'var(--text)', cursor:'pointer', fontFamily:'Nunito', fontWeight:700 }}>+ Kategoriya</button>
          <button onClick={() => openNewItem()} disabled={!categories.length} style={{ padding:'9px 13px', border:0, borderRadius:9, background:'var(--accent)', color:'#fff', cursor:'pointer', fontFamily:'Nunito', fontWeight:700 }}>+ Yangi taom</button>
        </div>
      </div>
      {categories.map(cat => (
        <div key={cat.id} style={{ marginBottom:22 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--subtext)', textTransform:'uppercase', letterSpacing:'0.7px' }}>{cat.name}</div>
            <button onClick={() => { setEditingCategory(cat); setCategoryName(cat.name); setCategoryDialog(true) }} style={{ border:0, background:'transparent', color:'var(--accent)', cursor:'pointer', fontSize:12 }}>Tahrirlash</button>
            <button onClick={() => removeCategory(cat)} style={{ border:0, background:'transparent', color:'#d94545', cursor:'pointer', fontSize:12 }}>O‘chirish</button>
            <button onClick={() => openNewItem(cat.id)} style={{ marginLeft:'auto', border:'1px solid var(--border)', background:'var(--card)', borderRadius:8, padding:'5px 9px', color:'var(--text)', cursor:'pointer', fontSize:11, fontWeight:700 }}>+ Taom</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[...cat.items].sort((a,b) => Number(a.order || 0) - Number(b.order || 0)).map(item => (
              <div key={item.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:16, opacity: item.is_available ? 1 : 0.5 }}>
                {item.image_url ? <img src={item.image_url} alt={item.name} style={{ width:'100%', height:130, objectFit:'cover', borderRadius:10, marginBottom:12, display:'block' }} /> : <div style={{ width:'100%', height:130, borderRadius:10, marginBottom:12, display:'grid', placeItems:'center', background:'var(--card2)', color:'var(--subtext)', fontSize:28 }}>🍽️</div>}
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, alignItems:'flex-start' }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>{item.name}</span>
                  <button onClick={() => toggleItem(item)} title={item.is_available ? 'Tugagan deb belgilash' : 'Mavjud deb belgilash'} style={{ border:0, padding:0, width:24, height:14, borderRadius:7, background: item.is_available ? '#2d9e6b' : 'var(--border)', position:'relative', flexShrink:0, cursor:'pointer' }}>
                    <span style={{ position:'absolute', top:2, width:10, height:10, borderRadius:5, background:'#fff', left: item.is_available ? 12 : 2, transition:'left 0.2s' }} />
                  </button>
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)' }}>{parseFloat(item.price).toLocaleString()} so'm</div>
                <div style={{ fontSize:11, color: item.is_available ? '#2d9e6b' : '#d94545', marginTop:4, fontWeight:600 }}>{item.is_available ? 'Mavjud' : 'Tugagan'}</div>
                <div style={{ display:'flex', gap:12, marginTop:12, borderTop:'1px solid var(--border)', paddingTop:9 }}><button onClick={() => openEditItem(item)} style={{ border:0, background:'transparent', color:'var(--accent)', cursor:'pointer', fontSize:12, fontWeight:700 }}>✎ Tahrirlash</button><button onClick={() => removeItem(item)} style={{ border:0, background:'transparent', color:'#d94545', cursor:'pointer', fontSize:12, fontWeight:700 }}>O‘chirish</button></div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!categories.length && <div style={{ padding:40, textAlign:'center', color:'var(--subtext)' }}>Avval kategoriya yarating.</div>}
      {categoryDialog && <Modal title={editingCategory ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'} onClose={() => setCategoryDialog(false)}><div style={{ display:'flex', flexDirection:'column', gap:14 }}><input style={INP} autoFocus placeholder="Masalan: Birinchi ovqatlar" value={categoryName} onChange={e => setCategoryName(e.target.value)} /><button onClick={saveCategory} disabled={busy || !categoryName.trim()} style={{ padding:12, background:'var(--accent)', color:'#fff', border:0, borderRadius:10, fontFamily:'Nunito', fontWeight:800 }}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</button></div></Modal>}
      {itemDialog && <Modal title={editingItem ? 'Taomni tahrirlash' : 'Yangi taom'} onClose={() => setItemDialog(false)}><div style={{ display:'flex', flexDirection:'column', gap:14 }}><select style={SEL} value={itemForm.category} onChange={e => setItemForm({...itemForm, category:e.target.value})}><option value="">Kategoriyani tanlang</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input style={INP} placeholder="Taom nomi" value={itemForm.name} onChange={e => setItemForm({...itemForm, name:e.target.value})} /><textarea style={{ ...INP, minHeight:80, resize:'vertical' }} placeholder="Tavsif (ixtiyoriy)" value={itemForm.description} onChange={e => setItemForm({...itemForm, description:e.target.value})} /><input style={INP} type="number" min="0" placeholder="Narxi (so‘m)" value={itemForm.price} onChange={e => setItemForm({...itemForm, price:e.target.value})} /><label style={{ border:'1px dashed var(--border)', borderRadius:10, padding:12, color:'var(--subtext)', cursor:'pointer', fontSize:13 }}>📷 Taom rasmi {itemForm.image ? `— ${itemForm.image.name}` : '(ixtiyoriy)'}<input type="file" accept="image/*" hidden onChange={e => setItemForm({...itemForm, image:e.target.files?.[0] || null})} /></label>{itemForm.image && <img src={URL.createObjectURL(itemForm.image)} alt="Tanlangan rasm" style={{ width:'100%', height:130, objectFit:'cover', borderRadius:10 }} />}<button onClick={saveItem} disabled={busy || !itemForm.name.trim() || !itemForm.price || !itemForm.category} style={{ padding:12, background:'var(--accent)', color:'#fff', border:0, borderRadius:10, fontFamily:'Nunito', fontWeight:800 }}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</button></div></Modal>}
    </div>
  )
}

// ── Reports page (charts + excel) ──────────────────────────────────────────────
function ReportsPage({ analytics, orders }: { analytics: AnalyticsT | null; orders: OrderT[] }) {
  if (!analytics) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Analytics yuklanmoqda…</div>

  const maxPeak = Math.max(...(analytics.peak_hours?.map(h => h.count) ?? [1]), 1)
  const maxQty  = analytics.popular_items?.[0]?.total_qty ?? 1
  const maxDay  = Math.max(...(analytics.daily_revenue?.map(d => d.revenue) ?? [1]), 1)

  const lineData = (analytics.daily_revenue ?? []).map(d => ({
    label: new Date(d.date).toLocaleDateString('uz',{month:'short',day:'numeric'}),
    value: d.revenue,
  }))

  const weeklyData = (analytics.weekly_pattern ?? []).map(d => ({
    label: DAYS[d.weekday % 7] ?? String(d.weekday),
    value: d.count,
  }))

  const orderTypes: Record<string,string> = { dine_in:"Restoranda", delivery:"Yetkazib berish", takeaway:"Olib ketish" }
  const typeTotal = (analytics.order_type_breakdown ?? []).reduce((s,t) => s + t.count, 0) || 1

  const section: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, marginBottom:16 }
  const secHead: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }
  const dlBtn = (rows: (string|number)[][], name: string) => (
    <button onClick={() => downloadCSV(rows, name)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:9, cursor:'pointer', color:'var(--subtext)', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}>
      <IcoDown />Excel
    </button>
  )

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Jami daromad (30 kun)', val: Number(analytics.total_revenue).toLocaleString()+" so'm", color:'#2d9e6b' },
          { label:'Jami buyurtmalar', val: String(analytics.total_orders), color:'#e8a820' },
          { label:"O'rtacha zakaz", val: analytics.total_orders ? (Number(analytics.total_revenue)/analytics.total_orders).toLocaleString(undefined,{maximumFractionDigits:0})+" so'm" : '—', color:'#7c6ff7' },
        ].map((k,i) => (
          <div key={i} style={{ background:'var(--card)', border:`1px solid ${k.color}33`, borderRadius:14, padding:'16px 18px' }}>
            <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Daily revenue line chart */}
      {lineData.length >= 2 && (
        <div style={section}>
          <div style={secHead}>
            <div style={{ fontWeight:700, fontSize:14 }}>Kunlik daromad (so'm)</div>
            {dlBtn([['Sana','Daromad'], ...analytics.daily_revenue.map(d=>[d.date, d.revenue])], 'kunlik_daromad')}
          </div>
          <LineChart data={lineData} color="#c8601a" />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            {lineData.filter((_,i) => i % Math.max(1, Math.floor(lineData.length/7)) === 0).map((d,i) => (
              <span key={i} style={{ fontSize:10, color:'var(--subtext)', fontWeight:600 }}>{d.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Weekly pattern */}
      {weeklyData.length > 0 && (
        <div style={section}>
          <div style={secHead}>
            <div style={{ fontWeight:700, fontSize:14 }}>Haftalik naqsh (buyurtmalar)</div>
            {dlBtn([['Kun','Buyurtmalar'], ...weeklyData.map(d=>[d.label,d.value])], 'haftalik_naqsh')}
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:100 }}>
            {weeklyData.map((d,i) => {
              const max = Math.max(...weeklyData.map(x=>x.value), 1)
              return (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:10, color:'var(--subtext)', fontWeight:700 }}>{d.value}</div>
                  <div style={{ width:'100%', borderRadius:'4px 4px 0 0', height:`${(d.value/max)*80}px`, background:'var(--gold)', transition:'height 0.4s' }} />
                  <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:700 }}>{d.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Peak hours bar chart */}
      {(analytics.peak_hours?.length ?? 0) > 0 && (
        <div style={section}>
          <div style={secHead}>
            <div style={{ fontWeight:700, fontSize:14 }}>Eng band soatlar</div>
            {dlBtn([['Soat','Buyurtmalar'], ...analytics.peak_hours.map(h=>[h.hour+':00',h.count])], 'band_soatlar')}
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:110 }}>
            {analytics.peak_hours.map((h,i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <div style={{ fontSize:9, color:'var(--subtext)', fontWeight:700 }}>{h.count}</div>
                <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${(h.count/maxPeak)*88}px`, background:'var(--accent)', transition:'height 0.4s' }} />
                <div style={{ fontSize:9, color:'var(--subtext)', fontWeight:700 }}>{h.hour}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popular items horizontal bars */}
      {(analytics.popular_items?.length ?? 0) > 0 && (
        <div style={section}>
          <div style={secHead}>
            <div style={{ fontWeight:700, fontSize:14 }}>Top taomlar</div>
            {dlBtn([['Taom','Soni','Daromad'], ...analytics.popular_items.map(d=>[d.menu_item__name,d.total_qty,d.total_revenue])], 'top_taomlar')}
          </div>
          {analytics.popular_items.slice(0,8).map((d,i) => (
            <div key={i} style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:600 }}>{d.menu_item__name}</span>
                <div style={{ display:'flex', gap:12 }}>
                  <span style={{ fontSize:12, color:'var(--subtext)' }}>{d.total_qty} ta</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>{Number(d.total_revenue).toLocaleString()} so'm</span>
                </div>
              </div>
              <div style={{ height:7, background:'var(--border)', borderRadius:4 }}>
                <div style={{ height:7, width:`${(d.total_qty/maxQty)*100}%`, background:`linear-gradient(90deg, var(--accent), var(--gold))`, borderRadius:4, transition:'width 0.5s' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order type breakdown */}
      {(analytics.order_type_breakdown?.length ?? 0) > 0 && (
        <div style={section}>
          <div style={secHead}>
            <div style={{ fontWeight:700, fontSize:14 }}>Buyurtma turlari</div>
            {dlBtn([['Tur','Soni'], ...analytics.order_type_breakdown.map(t=>[orderTypes[t.order_type]||t.order_type,t.count])], 'buyurtma_turlari')}
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {analytics.order_type_breakdown.map((t,i) => {
              const colors = ['#c8601a','#7c6ff7','#2d9e6b']
              const c = colors[i % colors.length]
              const pct = Math.round((t.count / typeTotal) * 100)
              return (
                <div key={i} style={{ flex:1, minWidth:140, background:c+'11', border:`1px solid ${c}33`, borderRadius:14, padding:'16px 18px' }}>
                  <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{orderTypes[t.order_type] || t.order_type}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:c }}>{t.count}</div>
                  <div style={{ fontSize:12, color:c, fontWeight:600, marginTop:4 }}>{pct}%</div>
                  <div style={{ height:4, background:'var(--border)', borderRadius:2, marginTop:10 }}>
                    <div style={{ height:4, width:`${pct}%`, background:c, borderRadius:2 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Download all button */}
      <button onClick={() => downloadCSV([
        ['#','Stol','Ofitsiant','Mahsulot','Summa','Holat','Vaqt'],
        ...orders.map(o=>[o.id,o.table_name,o.waiter_name,o.items.length,o.total,sl(o.status),new Date(o.opened_at).toLocaleString()])
      ], 'barcha_hisobot')} style={{ display:'flex', alignItems:'center', gap:8, padding:'13px 24px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
        <IcoDown />Barcha ma'lumotlarni Excel ga yuklab olish
      </button>
    </div>
  )
}

// ── Inventory placeholder ──────────────────────────────────────────────────────
function InventoryPage() {
  return (
    <div style={{ textAlign:'center', padding:'64px 0', color:'var(--subtext)' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Inventarizatsiya moduli</div>
      <div style={{ fontSize:14 }}>Tez kunda qo'shiladi</div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BusinessOwnerDashboard() {
  const navigate = useNavigate()
  const params = useParams<{ page?: string }>()
  const { logout, user } = useAuthStore()
  const validPages: Page[] = ['dashboard', 'orders', 'tables', 'staff', 'menu', 'reports', 'inventory']
  const routePage = validPages.includes(params.page as Page) ? params.page as Page : 'dashboard'
  const [active, setActive] = useState<Page>(routePage)
  const [orders, setOrders] = useState<OrderT[]>([])
  const [tables, setTables] = useState<TableT[]>([])
  const [rooms, setRooms] = useState<RoomT[]>([])
  const [staff, setStaff] = useState<StaffT[]>([])
  const [categories, setCategories] = useState<CategoryT[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsT | null>(null)
  const [taxSummary, setTaxSummary] = useState<TaxSummaryT | null>(null)
  const lastTick = useRef(0)

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderApi.today()
      setOrders(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  const loadTables = useCallback(async () => {
    try {
      const res = await tableApi.list()
      setTables(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  const loadRooms = useCallback(async () => {
    try {
      const res = await roomApi.list()
      setRooms(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch { setRooms([]) }
  }, [])

  const loadStaff = useCallback(async () => {
    try {
      const res = await staffApi.list()
      setStaff(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await analyticsApi.cafe({ days: 30 })
      // Cafe analytics javobi summary ichida keladi; dashboard esa tekis
      // ko‘rinishdagi qiymatlardan foydalanadi.
      const payload = res.data || {}
      const summary = payload.summary || {}
      setAnalytics({
        ...payload,
        total_orders: Number(summary.total_orders ?? payload.total_orders ?? 0),
        total_revenue: Number(summary.total_revenue ?? payload.total_revenue ?? 0),
      })
    } catch {}
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const res = await menuApi.categories()
      setCategories(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  const loadTaxSummary = useCallback(async () => {
    try {
      const res = await apiClient.get('dashboard/stats/')
      setTaxSummary(res.data)
    } catch {}
  }, [])

  // Initial load
  useEffect(() => {
    Promise.all([loadOrders(), loadTables(), loadRooms(), loadStaff()])
    loadCategories()
    loadAnalytics()
    loadTaxSummary()
  }, [loadOrders, loadTables, loadRooms, loadStaff, loadAnalytics, loadTaxSummary, loadCategories])

  // Real-time polling: orders + tables every 30s, analytics every 5min
  useEffect(() => {
    const poll = setInterval(() => {
      loadOrders()
      loadTables()
      lastTick.current++
      if (lastTick.current % 10 === 0) { loadAnalytics(); loadTaxSummary() }
    }, 30000)
    return () => clearInterval(poll)
  }, [loadOrders, loadTables, loadAnalytics, loadTaxSummary])

  const liveOpen = orders.filter(o => o.status === 'open').length

  useEffect(() => { setActive(routePage) }, [routePage])

  const pageTitles: Record<Page, string> = {
    dashboard: `Bosh sahifa — ${new Date().toLocaleDateString('uz-UZ',{day:'numeric',month:'long',year:'numeric'})}`,
    orders:    'Barcha buyurtmalar',
    tables:    'Stollar xaritasi',
    staff:     'Xodimlar boshqaruvi',
    menu:      'Menyu boshqaruvi',
    reports:   'Hisobotlar va tahlil',
    inventory: 'Inventarizatsiya',
  }

  const renderPage = () => {
    if (active === 'dashboard') return <HomePage analytics={analytics} orders={orders} taxSummary={taxSummary} />
    if (active === 'orders')    return <OrdersPage orders={orders} refresh={loadOrders} />
    if (active === 'tables')    return <TablesPage tables={tables} rooms={rooms} refresh={loadTables} refreshRooms={loadRooms} />
    if (active === 'staff')     return <StaffPage staff={staff} refresh={loadStaff} />
    if (active === 'menu')      return <MenuPage categories={categories} refresh={loadCategories} />
    if (active === 'reports')   return <ReportsPage analytics={analytics} orders={orders} />
    if (active === 'inventory') return <InventoryPage />
    return null
  }

  return (
    <div className="cafe-root" style={{ display:'flex' }}>
      <Sidebar active={active} onNav={(page) => { setActive(page); navigate(`/owner/${page}`) }} onLogout={() => { logout(); navigate('/login') }} liveCount={liveOpen} />
      <div style={{ marginLeft:220, flex:1, padding:'24px 26px', minHeight:'100vh' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.3px' }}>{pageTitles[active]}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {liveOpen > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', background:'rgba(209,68,68,0.12)', border:'1px solid rgba(209,68,68,0.3)', borderRadius:20 }}>
                <span style={{ width:7, height:7, borderRadius:4, background:'#d94545', display:'inline-block', boxShadow:'0 0 6px #d94545' }} />
                <span style={{ fontSize:13, fontWeight:700, color:'#d94545' }}>{liveOpen} aktiv zakaz</span>
              </div>
            )}
            <div style={{ fontSize:13, color:'var(--subtext)' }}>Salom, <b style={{ color:'var(--text)' }}>{user?.full_name || 'Boss'}</b></div>
          </div>
        </div>
        {renderPage()}
      </div>
    </div>
  )
}
