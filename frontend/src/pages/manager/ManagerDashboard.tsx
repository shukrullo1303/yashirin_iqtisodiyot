import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { orderApi, tableApi, staffApi, analyticsApi, menuApi, inventoryApi, locationApi } from '../../api/cafe'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TableStatus { has_open_order: boolean; order_id: number | null; item_count: number }
interface TableT { id: number; number: number; name: string; capacity: number; status: TableStatus }
interface OrderItem { menu_item_name: string; quantity: number }
interface OrderT { id: number; table_name: string; waiter_name: string; status: string; total: string; opened_at: string; items: OrderItem[] }
interface StaffT { id: number; username: string; full_name: string; role: string; is_active: boolean }
interface AnalyticsT { total_orders: number; total_revenue: number; peak_hours: {hour:number; count:number}[]; popular_items: {menu_item__name:string; total_qty:number}[] }
interface MenuItemT { id: number; name: string; price: string; description: string; is_available: boolean; category: number }
interface CategoryT { id: number; name: string; location: number; is_active: boolean; items: MenuItemT[] }
interface InvT { id: number; name: string; unit: string; quantity: string; min_quantity: string; is_low: boolean; location: number }
interface LocT { id: number; name: string }

type Page = 'orders' | 'tables' | 'shifts' | 'cash' | 'menu' | 'inventory'

// ── Helpers ───────────────────────────────────────────────────────────────────
const sc = (s: string) => ({ open: '#7c6ff7', ready: '#e8a820', paid: '#2d9e6b', cancelled: '#d94545' }[s] || '#9a7060')
const sl = (s: string) => ({ open: 'Yangi', ready: 'Tayyor', paid: "To'langan", cancelled: 'Bekor' }[s] || s)
const rl = (r: string) => ({ waiter: 'Ofitsiant', cafe_manager: 'Menejer', kitchen: 'Oshpaz' }[r] || r)

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoOrders  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
const IcoTables  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="4" rx="1"/><line x1="6" y1="12" x2="6" y2="17"/><line x1="18" y1="12" x2="18" y2="17"/><line x1="4" y1="19" x2="20" y2="19"/></svg>
const IcoClock   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IcoCard    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
const IcoMenu    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
const IcoBox     = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
const IcoLogout  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const IcoPlus    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoTrash   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>

const NAV: { id: Page; label: string; Icon: () => JSX.Element }[] = [
  { id: 'orders',    label: 'Buyurtmalar', Icon: IcoOrders  },
  { id: 'tables',    label: 'Stollar',     Icon: IcoTables  },
  { id: 'shifts',    label: 'Xodimlar',   Icon: IcoClock   },
  { id: 'cash',      label: 'Kassa',      Icon: IcoCard    },
  { id: 'menu',      label: 'Menyu',      Icon: IcoMenu    },
  { id: 'inventory', label: 'Inventar',   Icon: IcoBox     },
]

// ── Shared styles ─────────────────────────────────────────────────────────────
const INP: React.CSSProperties = { width:'100%', padding:'10px 14px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Nunito', fontSize:14, outline:'none', boxSizing:'border-box' }
const SEL: React.CSSProperties = { ...INP }

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 28px 24px', width:'100%', maxWidth:440, maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontWeight:800, fontSize:16 }}>{title}</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--subtext)', cursor:'pointer', fontSize:20, fontFamily:'Nunito' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrBox({ msg }: { msg: string }) {
  if (!msg) return null
  return <div style={{ background:'rgba(209,68,68,0.1)', border:'1px solid rgba(209,68,68,0.3)', borderRadius:8, padding:'10px 14px', color:'#d94545', fontSize:13 }}>{msg}</div>
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const c = sc(status)
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:c+'22', color:c, border:`1px solid ${c}44` }}><span style={{ width:6, height:6, borderRadius:3, background:c }} />{sl(status)}</span>
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active, onNav, onLogout }: { active: Page; onNav: (p: Page) => void; onLogout: () => void }) {
  const [hov, setHov] = useState<Page | null>(null)
  return (
    <div style={{ width:220, minHeight:'100vh', background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'0 0 24px 0', position:'fixed', top:0, left:0, bottom:0, zIndex:10 }}>
      <div style={{ padding:'22px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg, #e8a820 0%, #d4621e 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>☕</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.3px' }}>CAFE CRM</div>
            <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:600 }}>Menejer Panel</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:'14px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(({ id, label, Icon }) => {
          const isActive = active === id; const isHov = hov === id
          return (
            <button key={id} onClick={() => onNav(id)} onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background: isActive ? '#e8a820' : isHov ? 'var(--card2)' : 'transparent', color: isActive ? '#fff' : isHov ? 'var(--text)' : 'var(--subtext)', border:'none', cursor:'pointer', fontFamily:'Nunito', fontSize:14, fontWeight: isActive ? 700 : 500, transition:'all 0.13s', textAlign:'left', width:'100%' }}>
              <Icon />{label}
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

// ── Orders page ───────────────────────────────────────────────────────────────
function OrdersPage({ orders, refresh }: { orders: OrderT[]; refresh: () => void }) {
  const [filter, setFilter] = useState('Hammasi')
  const filters = ['Hammasi', 'Yangi', 'Tayyor', "To'langan"]
  const statusNext: Record<string,string> = { open:'ready', ready:'paid' }
  const btnLabel: Record<string,string>   = { open:'Tayyor', ready:"To'lash" }

  const advance = async (id: number, status: string) => {
    const next = statusNext[status]; if (!next) return
    try { await orderApi.updateStatus(id, next); refresh() } catch {}
  }

  const filtered = orders.filter(o => {
    if (filter === 'Yangi') return o.status === 'open'
    if (filter === 'Tayyor') return o.status === 'ready'
    if (filter === "To'langan") return o.status === 'paid'
    return true
  })

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
        {filters.map(f => <button key={f} onClick={() => setFilter(f)} style={{ padding:'7px 15px', borderRadius:20, fontSize:13, fontWeight:600, background: filter===f ? '#e8a820' : 'var(--card)', color: filter===f ? '#fff' : 'var(--subtext)', border:'1px solid var(--border)', cursor:'pointer', fontFamily:'Nunito' }}>{f}</button>)}
        <span style={{ marginLeft:'auto', fontSize:13, color:'var(--subtext)', alignSelf:'center' }}>{filtered.length} ta</span>
      </div>
      {filtered.length === 0 ? <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Buyurtma yo'q</div> : (
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
                {o.items.map((item, i) => <div key={i} style={{ fontSize:13, padding:'2px 0' }}>{item.menu_item_name} × {item.quantity}</div>)}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>{Number(o.total).toLocaleString()} so'm</div>
                  <div style={{ fontSize:11, color:'var(--subtext)', marginTop:2 }}>{o.waiter_name} · {new Date(o.opened_at).toLocaleTimeString('uz',{hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                {statusNext[o.status] && <button onClick={() => advance(o.id, o.status)} style={{ padding:'9px 18px', background:sc(o.status), color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}>{btnLabel[o.status]}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tables page ───────────────────────────────────────────────────────────────
function TablesPage({ tables, locations, refresh }: { tables: TableT[]; locations: LocT[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ location:'', number:'', name:'', capacity:'4' })
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const busy = tables.filter(t => t.status.has_open_order).length
  const free = tables.length - busy

  const create = async () => {
    if (!form.location || !form.number) { setErr("Lokatsiya va stol raqamini kiriting"); return }
    setSaving(true); setErr('')
    try {
      await tableApi.create({ location: Number(form.location), number: Number(form.number), name: form.name, capacity: Number(form.capacity) || 4 })
      refresh(); setShowAdd(false); setForm({ location:'', number:'', name:'', capacity:'4' })
    } catch (e: any) { setErr(e?.response?.data?.non_field_errors?.[0] || e?.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (!confirm("Stolni o'chirishni tasdiqlaysizmi?")) return
    try { await tableApi.delete(id); refresh() } catch {}
  }

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        {[{label:'Band',val:busy,color:'#d4621e'},{label:"Bo'sh",val:free,color:'#2d9e6b'}].map((s,i) => (
          <div key={i} style={{ background:'var(--card)', border:`1px solid ${s.color}33`, borderRadius:14, padding:'14px 24px', textAlign:'center' }}>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--subtext)', fontWeight:600 }}>{s.label}</div>
          </div>
        ))}
        <button onClick={() => setShowAdd(true)} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'9px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}><IcoPlus />Stol qo'shish</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {tables.map(t => {
          const c = t.status.has_open_order ? '#d4621e' : '#2d9e6b'
          return (
            <div key={t.id} style={{ background:'var(--card)', border:`2px solid ${c}33`, borderRadius:16, padding:16, position:'relative' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor=c)}
              onMouseLeave={e => (e.currentTarget.style.borderColor=c+'33')}
            >
              <div style={{ position:'absolute', top:10, right:10, width:8, height:8, borderRadius:4, background:c }} />
              <div style={{ fontSize:22, fontWeight:800, color:c, marginBottom:4 }}>{t.number}</div>
              {t.name && <div style={{ fontSize:11, color:'var(--subtext)', marginBottom:2 }}>{t.name}</div>}
              <div style={{ fontSize:11, color:'var(--subtext)', marginBottom:8, fontWeight:600 }}>{t.capacity} o'rin</div>
              {t.status.has_open_order
                ? <div style={{ fontSize:11, fontWeight:700 }}>{t.status.item_count} ta mahsulot</div>
                : <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#2d9e6b' }}>Bo'sh</div>
                    <button onClick={() => remove(t.id)} style={{ background:'rgba(209,68,68,0.1)', border:'1px solid rgba(209,68,68,0.2)', borderRadius:6, padding:'3px 6px', cursor:'pointer', color:'#d94545' }}><IcoTrash /></button>
                  </div>
              }
            </div>
          )
        })}
      </div>

      {showAdd && (
        <Modal title="Yangi stol qo'shish" onClose={() => { setShowAdd(false); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Lokatsiya *</label>
              <select style={SEL} value={form.location} onChange={e => setForm(f => ({...f, location:e.target.value}))}>
                <option value="">— Tanlang —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Stol raqami *</label>
              <input style={INP} type="number" placeholder="1" value={form.number} onChange={e => setForm(f => ({...f, number:e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Nomi (ixtiyoriy)</label>
              <input style={INP} placeholder="VIP stol" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Sig'im (o'rin)</label>
              <input style={INP} type="number" placeholder="4" value={form.capacity} onChange={e => setForm(f => ({...f, capacity:e.target.value}))} />
            </div>
            <ErrBox msg={err} />
            <button onClick={create} disabled={saving} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {saving ? 'Saqlanmoqda…' : "+ Stol qo'shish"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Shifts page ───────────────────────────────────────────────────────────────
function ShiftsPage({ staff }: { staff: StaffT[] }) {
  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <span style={{ fontSize:14, color:'var(--subtext)' }}>Jami: <b style={{ color:'var(--text)' }}>{staff.length} xodim</b></span>
      </div>
      {staff.length === 0 ? <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Xodim topilmadi</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          {staff.map(s => {
            const c = s.is_active ? '#2d9e6b' : '#987060'
            return (
              <div key={s.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:18, display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:46, height:46, borderRadius:14, background:c+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:800, color:c, flexShrink:0 }}>
                  {(s.full_name||s.username)[0]?.toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.full_name||s.username}</div>
                  <div style={{ fontSize:12, color:'var(--subtext)' }}>{rl(s.role)}</div>
                </div>
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:c+'22', color:c, border:`1px solid ${c}44`, flexShrink:0 }}>
                  <span style={{ width:6, height:6, borderRadius:3, background:c }} />{s.is_active ? 'Faol' : 'Nofaol'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Cash page ─────────────────────────────────────────────────────────────────
function CashPage({ analytics }: { analytics: AnalyticsT | null }) {
  if (!analytics) return <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>Yuklanmoqda…</div>
  const avgOrder = analytics.total_orders ? Math.round(Number(analytics.total_revenue) / analytics.total_orders) : 0
  const stats = [
    { label:'Bugungi sotuv',  val: Number(analytics.total_revenue).toLocaleString() + " so'm", color:'#2d9e6b' },
    { label:'Buyurtmalar',    val: String(analytics.total_orders),                              color:'#e8a820' },
    { label:"O'rtacha zakaz", val: avgOrder.toLocaleString() + " so'm",                        color:'#7c6ff7' },
  ]
  const maxPeak = Math.max(...(analytics.peak_hours?.map(h => h.count) ?? [1]), 1)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {stats.map((item, i) => (
          <div key={i} style={{ background:'var(--card)', border:`1px solid ${item.color}33`, borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:'var(--subtext)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{item.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:item.color }}>{item.val}</div>
          </div>
        ))}
      </div>
      {(analytics.peak_hours?.length ?? 0) > 0 && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Eng band soatlar</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:100 }}>
            {analytics.peak_hours.map((h, i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ fontSize:10, color:'var(--subtext)', fontWeight:700 }}>{h.count}</div>
                <div style={{ width:'100%', borderRadius:'4px 4px 0 0', height:`${(h.count/maxPeak)*80}px`, background:'var(--accent)', transition:'height 0.4s ease' }} />
                <div style={{ fontSize:10, color:'var(--subtext)', fontWeight:700 }}>{h.hour}:00</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {(analytics.popular_items?.length ?? 0) > 0 && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Top taomlar (bugun)</div>
          {analytics.popular_items.slice(0,5).map((d, i) => {
            const maxQty = analytics.popular_items[0].total_qty
            return (
              <div key={i} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{d.menu_item__name}</span>
                  <span style={{ fontSize:12, color:'var(--subtext)' }}>{d.total_qty} ta</span>
                </div>
                <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                  <div style={{ height:5, width:`${(d.total_qty/maxQty)*100}%`, background:'var(--accent)', borderRadius:3 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Menu page ─────────────────────────────────────────────────────────────────
function MenuPage({ categories, locations, refresh }: { categories: CategoryT[]; locations: LocT[]; refresh: () => void }) {
  const [selCat, setSelCat] = useState<number | null>(null)
  const [showAddCat, setShowAddCat]   = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [catForm,  setCatForm]  = useState({ location:'', name:'' })
  const [itemForm, setItemForm] = useState({ name:'', price:'', description:'' })
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)

  const currentCat = selCat != null ? categories.find(c => c.id === selCat) : categories[0]

  const createCat = async () => {
    if (!catForm.location || !catForm.name) { setErr("Barcha maydonlar to'ldirilsin"); return }
    setSaving(true); setErr('')
    try { await menuApi.createCategory({ location: Number(catForm.location), name: catForm.name }); refresh(); setShowAddCat(false); setCatForm({ location:'', name:'' }) }
    catch (e: any) { setErr(e?.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  const deleteCat = async (id: number) => {
    if (!confirm("Kategoriyani o'chirishni tasdiqlaysizmi?")) return
    try { await menuApi.deleteCategory(id); refresh() } catch {}
  }

  const createItem = async () => {
    if (!currentCat || !itemForm.name || !itemForm.price) { setErr("Ism va narxni kiriting"); return }
    setSaving(true); setErr('')
    try { await menuApi.createItem({ category: currentCat.id, name: itemForm.name, price: Number(itemForm.price), description: itemForm.description }); refresh(); setShowAddItem(false); setItemForm({ name:'', price:'', description:'' }) }
    catch (e: any) { setErr(e?.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  const toggleItem = async (item: MenuItemT) => {
    try { await menuApi.updateItem(item.id, { is_available: !item.is_available }); refresh() } catch {}
  }

  const deleteItem = async (id: number) => {
    if (!confirm("Mahsulotni o'chirishni tasdiqlaysizmi?")) return
    try { await menuApi.deleteItem(id); refresh() } catch {}
  }

  return (
    <div style={{ display:'flex', gap:20 }}>
      {/* Category sidebar */}
      <div style={{ width:200, flexShrink:0, display:'flex', flexDirection:'column', gap:4 }}>
        <button onClick={() => { setShowAddCat(true); setErr('') }} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 12px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13, marginBottom:8 }}><IcoPlus />Kategoriya</button>
        {categories.map(cat => (
          <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={() => setSelCat(cat.id)} style={{ flex:1, padding:'9px 12px', borderRadius:10, background: currentCat?.id===cat.id ? 'var(--card2)' : 'transparent', color: currentCat?.id===cat.id ? 'var(--text)' : 'var(--subtext)', border: currentCat?.id===cat.id ? '1px solid var(--border)' : '1px solid transparent', cursor:'pointer', fontFamily:'Nunito', fontSize:13, fontWeight:600, textAlign:'left' }}>
              {cat.name} <span style={{ fontSize:11, color:'var(--subtext)' }}>{cat.items.length}</span>
            </button>
            <button onClick={() => deleteCat(cat.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--subtext)', padding:'4px', display:'flex' }}><IcoTrash /></button>
          </div>
        ))}
        {categories.length === 0 && <div style={{ fontSize:13, color:'var(--subtext)', padding:'8px 0' }}>Kategoriya yo'q</div>}
      </div>

      {/* Items */}
      <div style={{ flex:1 }}>
        {currentCat ? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontWeight:700, fontSize:15 }}>{currentCat.name} — {currentCat.items.length} ta taom</span>
              <button onClick={() => { setShowAddItem(true); setErr('') }} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}><IcoPlus />Mahsulot</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {currentCat.items.map(item => (
                <div key={item.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:16, opacity: item.is_available ? 1 : 0.6 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{item.name}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)', marginBottom:8 }}>{parseFloat(item.price).toLocaleString()} so'm</div>
                  {item.description && <div style={{ fontSize:12, color:'var(--subtext)', marginBottom:10 }}>{item.description}</div>}
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => toggleItem(item)} style={{ flex:1, padding:'7px', borderRadius:8, background: item.is_available ? '#2d9e6b22' : 'var(--card2)', border:`1px solid ${item.is_available ? '#2d9e6b44' : 'var(--border)'}`, color: item.is_available ? '#2d9e6b' : 'var(--subtext)', cursor:'pointer', fontFamily:'Nunito', fontSize:12, fontWeight:600 }}>
                      {item.is_available ? '✓ Mavjud' : '✗ Tugagan'}
                    </button>
                    <button onClick={() => deleteItem(item.id)} style={{ padding:'7px 10px', borderRadius:8, background:'rgba(209,68,68,0.08)', border:'1px solid rgba(209,68,68,0.2)', cursor:'pointer', color:'#d94545' }}><IcoTrash /></button>
                  </div>
                </div>
              ))}
              {currentCat.items.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px 0', color:'var(--subtext)' }}>Bu kategoriyada taom yo'q</div>}
            </div>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'64px 0', color:'var(--subtext)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🍽️</div>
            <div style={{ fontSize:15, fontWeight:700 }}>Kategoriya tanlang yoki qo'shing</div>
          </div>
        )}
      </div>

      {showAddCat && (
        <Modal title="Yangi kategoriya" onClose={() => { setShowAddCat(false); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Lokatsiya *</label>
              <select style={SEL} value={catForm.location} onChange={e => setCatForm(f => ({...f, location:e.target.value}))}>
                <option value="">— Tanlang —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Nomi *</label>
              <input style={INP} placeholder="Asosiy taomlar" value={catForm.name} onChange={e => setCatForm(f => ({...f, name:e.target.value}))} />
            </div>
            <ErrBox msg={err} />
            <button onClick={createCat} disabled={saving} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {saving ? 'Saqlanmoqda…' : "+ Kategoriya qo'shish"}
            </button>
          </div>
        </Modal>
      )}

      {showAddItem && currentCat && (
        <Modal title={`Yangi taom — ${currentCat.name}`} onClose={() => { setShowAddItem(false); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Nomi *</label>
              <input style={INP} placeholder="Osh" value={itemForm.name} onChange={e => setItemForm(f => ({...f, name:e.target.value}))} />
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Narxi (so'm) *</label>
              <input style={INP} type="number" placeholder="25000" value={itemForm.price} onChange={e => setItemForm(f => ({...f, price:e.target.value}))} />
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Tavsif (ixtiyoriy)</label>
              <input style={INP} placeholder="Milliy taom..." value={itemForm.description} onChange={e => setItemForm(f => ({...f, description:e.target.value}))} />
            </div>
            <ErrBox msg={err} />
            <button onClick={createItem} disabled={saving} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {saving ? 'Saqlanmoqda…' : "+ Mahsulot qo'shish"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Inventory page ────────────────────────────────────────────────────────────
function InventoryPage({ items, locations, refresh }: { items: InvT[]; locations: LocT[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ location:'', name:'', unit:'dona', quantity:'0', min_quantity:'0' })
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const UNITS = ['dona', 'kg', 'g', 'l', 'ml', 'paket']
  const lowCount = items.filter(i => i.is_low).length

  const create = async () => {
    if (!form.location || !form.name) { setErr("Lokatsiya va nomni kiriting"); return }
    setSaving(true); setErr('')
    try {
      await inventoryApi.create({ location: Number(form.location), name: form.name, unit: form.unit, quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) })
      refresh(); setShowAdd(false); setForm({ location:'', name:'', unit:'dona', quantity:'0', min_quantity:'0' })
    } catch (e: any) { setErr(e?.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  const adjust = async (id: number, delta: number) => { try { await inventoryApi.adjust(id, delta); refresh() } catch {} }
  const remove  = async (id: number) => { if (!confirm("O'chirishni tasdiqlaysizmi?")) return; try { await inventoryApi.delete(id); refresh() } catch {} }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:14, color:'var(--subtext)' }}>Jami: <b style={{ color:'var(--text)' }}>{items.length} ta</b></span>
          {lowCount > 0 && <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700, background:'rgba(209,68,68,0.15)', color:'#d94545', border:'1px solid rgba(209,68,68,0.3)' }}>⚠ {lowCount} ta kam</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Nunito', fontWeight:700, fontSize:13 }}><IcoPlus />Qo'shish</button>
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 80px 100px 80px 90px 48px', background:'var(--card2)', borderBottom:'1px solid var(--border)' }}>
          {['Mahsulot','Birlik','Miqdor','Min','Tartibga solish',''].map((h,i) => (
            <div key={i} style={{ padding:'11px 14px', fontSize:11, fontWeight:800, color:'var(--subtext)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</div>
          ))}
        </div>
        {items.map(item => {
          const low = item.is_low
          return (
            <div key={item.id} style={{ display:'grid', gridTemplateColumns:'2fr 80px 100px 80px 90px 48px', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
              <div style={{ padding:'13px 14px', fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:8, height:8, borderRadius:4, background: low ? '#d94545' : '#2d9e6b', flexShrink:0, display:'inline-block' }} />
                {item.name}
              </div>
              <div style={{ padding:'13px 14px', fontSize:13, color:'var(--subtext)' }}>{item.unit}</div>
              <div style={{ padding:'13px 14px', fontWeight:700, fontSize:15, color: low ? '#d94545' : 'var(--text)' }}>{parseFloat(item.quantity).toLocaleString()}</div>
              <div style={{ padding:'13px 14px', fontSize:13, color:'var(--subtext)' }}>{parseFloat(item.min_quantity).toLocaleString()}</div>
              <div style={{ padding:'8px 14px', display:'flex', gap:6 }}>
                <button onClick={() => adjust(item.id, -1)} style={{ width:28, height:28, borderRadius:7, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Nunito' }}>−</button>
                <button onClick={() => adjust(item.id,  1)} style={{ width:28, height:28, borderRadius:7, background:'var(--accent)', border:'none', color:'#fff', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Nunito' }}>+</button>
              </div>
              <div style={{ padding:'8px 8px 8px 0' }}>
                <button onClick={() => remove(item.id)} style={{ background:'rgba(209,68,68,0.08)', border:'1px solid rgba(209,68,68,0.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#d94545', display:'flex' }}><IcoTrash /></button>
              </div>
            </div>
          )
        })}
        {items.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 0', color:'var(--subtext)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:15, fontWeight:700 }}>Inventar bo'sh</div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Inventarga qo'shish" onClose={() => { setShowAdd(false); setErr('') }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Lokatsiya *</label>
              <select style={SEL} value={form.location} onChange={e => setForm(f => ({...f, location:e.target.value}))}>
                <option value="">— Tanlang —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Mahsulot nomi *</label>
              <input style={INP} placeholder="Un, Go'sht, Moy…" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Birlik</label>
                <select style={SEL} value={form.unit} onChange={e => setForm(f => ({...f, unit:e.target.value}))}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Joriy miqdor</label>
                <input style={INP} type="number" placeholder="0" value={form.quantity} onChange={e => setForm(f => ({...f, quantity:e.target.value}))} />
              </div>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:'var(--subtext)', display:'block', marginBottom:6 }}>Minimum chegarasi</label>
              <input style={INP} type="number" placeholder="5" value={form.min_quantity} onChange={e => setForm(f => ({...f, min_quantity:e.target.value}))} />
            </div>
            <ErrBox msg={err} />
            <button onClick={create} disabled={saving} style={{ padding:'13px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'Nunito', fontWeight:800, fontSize:14 }}>
              {saving ? 'Saqlanmoqda…' : "+ Inventarga qo'shish"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()
  const [active, setActive] = useState<Page>('orders')
  const [orders,     setOrders]     = useState<OrderT[]>([])
  const [tables,     setTables]     = useState<TableT[]>([])
  const [staff,      setStaff]      = useState<StaffT[]>([])
  const [analytics,  setAnalytics]  = useState<AnalyticsT | null>(null)
  const [categories, setCategories] = useState<CategoryT[]>([])
  const [inventory,  setInventory]  = useState<InvT[]>([])
  const [locations,  setLocations]  = useState<LocT[]>([])

  const loadOrders     = useCallback(async () => { try { const r = await orderApi.today();    setOrders(Array.isArray(r.data) ? r.data : r.data.results ?? []) } catch {} }, [])
  const loadTables     = useCallback(async () => { try { const r = await tableApi.list();     setTables(Array.isArray(r.data) ? r.data : r.data.results ?? []) } catch {} }, [])
  const loadCategories = useCallback(async () => { try { const r = await menuApi.categories(); setCategories(Array.isArray(r.data) ? r.data : r.data.results ?? []) } catch {} }, [])
  const loadInventory  = useCallback(async () => { try { const r = await inventoryApi.list(); setInventory(Array.isArray(r.data) ? r.data : r.data.results ?? []) } catch {} }, [])
  const loadLocations  = useCallback(async () => { try { const r = await locationApi.list(); setLocations(Array.isArray(r.data) ? r.data : r.data.results ?? []) } catch {} }, [])

  useEffect(() => {
    loadOrders(); loadTables(); loadCategories(); loadInventory(); loadLocations()
    staffApi.list().then(r => setStaff(Array.isArray(r.data) ? r.data : r.data.results ?? [])).catch(() => {})
    analyticsApi.cafe({ days: 1 }).then(r => setAnalytics(r.data)).catch(() => {})
    const t = setInterval(() => { loadOrders(); loadTables() }, 30000)
    return () => clearInterval(t)
  }, [loadOrders, loadTables, loadCategories, loadInventory, loadLocations])

  const pageTitles: Record<Page, string> = {
    orders:    'Buyurtmalar',
    tables:    'Stollar',
    shifts:    'Xodimlar',
    cash:      'Kassa hisoboti',
    menu:      'Menyu boshqaruvi',
    inventory: 'Inventarizatsiya',
  }

  const renderPage = () => {
    if (active === 'orders')    return <OrdersPage    orders={orders}        refresh={loadOrders} />
    if (active === 'tables')    return <TablesPage    tables={tables}        locations={locations} refresh={loadTables} />
    if (active === 'shifts')    return <ShiftsPage    staff={staff} />
    if (active === 'cash')      return <CashPage      analytics={analytics} />
    if (active === 'menu')      return <MenuPage      categories={categories} locations={locations} refresh={loadCategories} />
    if (active === 'inventory') return <InventoryPage items={inventory}      locations={locations} refresh={loadInventory} />
    return null
  }

  return (
    <div className="cafe-root" style={{ display:'flex' }}>
      <Sidebar active={active} onNav={setActive} onLogout={() => { logout(); navigate('/login') }} />
      <div style={{ marginLeft:220, flex:1, padding:'24px 26px', minHeight:'100vh' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.3px' }}>{pageTitles[active]}</h1>
          <div style={{ fontSize:13, color:'var(--subtext)' }}>Salom, <b style={{ color:'var(--text)' }}>{user?.full_name || 'Menejer'}</b></div>
        </div>
        {renderPage()}
      </div>
    </div>
  )
}
