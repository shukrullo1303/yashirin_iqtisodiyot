import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import apiClient from '../../api/client'

// ── Types ──────────────────────────────────────────────────────────────────────
interface LocationT {
  id: number
  name: string
  address: string
  location_type: string
  is_active: boolean
  is_registered: boolean
  tax_id: string | null
}

interface BossT {
  id: number
  username: string
  full_name: string
  role: string
  location: number | null
  location_name: string | null
  is_active: boolean
  date_joined: string
}

interface StaffT {
  id: number
  username: string
  full_name: string
  role: string
  is_active: boolean
}

type Page = 'overview' | 'locations' | 'bosses' | 'staff'

// ── Helpers ────────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  cafe: 'Kafe', restaurant: 'Restoran', tea_house: 'Choyxona',
  hair_salon: 'Sartaroshxona', car_wash: 'Avtoyuvish',
  service_center: 'Xizmat markazi', household_service: 'Maishiy xizmat', other: 'Boshqa',
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const IcoGrid    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const IcoMap     = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
const IcoBriefcase = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M2 12h20"/></svg>
const IcoUsers   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const IcoLogout  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const IcoPlus    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoKey     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="4"/><line x1="10.24" y1="10.24" x2="21" y2="21"/><line x1="18" y1="18" x2="21" y2="21"/><line x1="18" y1="21" x2="21" y2="18"/></svg>
const IcoTrash   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IcoShield  = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

// ── Shared styles ──────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  background: 'var(--card2)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)', fontFamily: 'Nunito', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}
const SEL: React.CSSProperties = { ...INP, appearance: 'none' }

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 32, width: 440, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontWeight: 800, fontSize: 17 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'var(--border)', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: 'var(--text)', fontSize: 16, fontFamily: 'Nunito', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
const NAV: { id: Page; label: string; Icon: () => JSX.Element }[] = [
  { id: 'overview',   label: 'Umumiy',      Icon: IcoGrid },
  { id: 'locations',  label: 'Lokatsiyalar', Icon: IcoMap },
  { id: 'bosses',     label: 'Boss akkauntlar', Icon: IcoBriefcase },
  { id: 'staff',      label: 'Barcha xodimlar', Icon: IcoUsers },
]

function Sidebar({ active, onNav, onLogout, user }: { active: Page; onNav: (p: Page) => void; onLogout: () => void; user: { full_name?: string; username?: string } | null }) {
  const [hov, setHov] = useState<Page | null>(null)
  return (
    <div style={{ width: 230, minHeight: '100vh', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '0 0 28px 0', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 10 }}>
      {/* Brand */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <IcoShield />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.3px' }}>SUPER ADMIN</div>
            <div style={{ fontSize: 11, color: 'var(--subtext)', fontWeight: 600 }}>Bosh boshqaruv</div>
          </div>
        </div>
        {user && (
          <div style={{ marginTop: 14, padding: '8px 10px', background: 'var(--card2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{user.full_name || user.username}</div>
            <div style={{ fontSize: 11, color: 'var(--subtext)', marginTop: 1 }}>@{user.username}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ id, label, Icon }) => {
          const isActive = active === id
          const isHov = hov === id
          return (
            <button key={id} onClick={() => onNav(id)}
              onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: isActive ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : isHov ? 'var(--card2)' : 'transparent', color: isActive ? '#fff' : isHov ? 'var(--text)' : 'var(--subtext)', border: 'none', cursor: 'pointer', fontFamily: 'Nunito', fontSize: 14, fontWeight: isActive ? 700 : 500, transition: 'all 0.13s', textAlign: 'left', width: '100%', boxShadow: isActive ? '0 2px 12px rgba(99,102,241,0.3)' : 'none' }}>
              <Icon />{label}
            </button>
          )
        })}
      </nav>

      {/* Logout — subtle */}
      <div style={{ padding: '0 10px' }}>
        <button onClick={onLogout}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtext)', cursor: 'pointer', fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.13s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--subtext)' }}
        >
          <IcoLogout />Chiqish
        </button>
      </div>
    </div>
  )
}

// ── Overview page ──────────────────────────────────────────────────────────────
function OverviewPage({ locations, bosses, staff }: { locations: LocationT[]; bosses: BossT[]; staff: StaffT[] }) {
  const stats = [
    { label: 'Lokatsiyalar', value: locations.length, sub: `${locations.filter(l => l.is_active).length} aktiv`, color: '#6366f1', emoji: '🏪' },
    { label: 'Boss akkauntlar', value: bosses.length, sub: `${bosses.filter(b => b.is_active).length} aktiv`, color: '#8b5cf6', emoji: '👔' },
    { label: 'Umumiy xodimlar', value: staff.length, sub: `${staff.filter(s => s.is_active).length} aktiv`, color: '#06b6d4', emoji: '👥' },
    { label: 'Ro\'yxatdagi', value: locations.filter(l => l.is_registered).length, sub: `${locations.length - locations.filter(l => l.is_registered).length} kutilmoqda`, color: '#10b981', emoji: '✅' },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ background: 'var(--card)', border: `1px solid ${s.color}25`, borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--subtext)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 5 }}>{s.sub}</div>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.emoji}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent locations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>So'nggi lokatsiyalar</div>
          {locations.slice(0, 6).map(loc => (
            <div key={loc.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{loc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 2 }}>{TYPE_LABELS[loc.location_type] || loc.location_type}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: loc.is_active ? '#10b98120' : '#ef444420', color: loc.is_active ? '#10b981' : '#ef4444', border: `1px solid ${loc.is_active ? '#10b98130' : '#ef444430'}` }}>
                {loc.is_active ? 'Aktiv' : 'Nofaol'}
              </span>
            </div>
          ))}
          {locations.length === 0 && <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--subtext)', fontSize: 13 }}>Lokatsiyalar yo'q</div>}
        </div>

        {/* Boss accounts */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Boss akkauntlar</div>
          {bosses.slice(0, 6).map(boss => (
            <div key={boss.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                {(boss.full_name || boss.username)[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boss.full_name || boss.username}</div>
                <div style={{ fontSize: 12, color: 'var(--subtext)' }}>{boss.location_name || 'Lokatsiyasiz'}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: boss.is_active ? '#10b98120' : '#ef444420', color: boss.is_active ? '#10b981' : '#ef4444', border: `1px solid ${boss.is_active ? '#10b98130' : '#ef444430'}`, flexShrink: 0 }}>
                {boss.is_active ? 'Faol' : 'Nofaol'}
              </span>
            </div>
          ))}
          {bosses.length === 0 && <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--subtext)', fontSize: 13 }}>Boss akkauntlar yo'q</div>}
        </div>
      </div>
    </div>
  )
}

// ── Locations page ─────────────────────────────────────────────────────────────
function LocationsPage({ locations, refresh }: { locations: LocationT[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPwd, setShowPwd] = useState<LocationT | null>(null)
  const [form, setForm] = useState({ name: '', address: '', location_type: 'cafe', tax_id: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const create = async () => {
    if (!form.name || !form.address) { setErr("Nomi va manzil to'ldirilishi shart"); return }
    setLoading(true); setErr('')
    try {
      await apiClient.post('locations/', { ...form, is_active: true, tax_id: form.tax_id || null })
      await refresh(); setShowAdd(false)
      setForm({ name: '', address: '', location_type: 'cafe', tax_id: '' })
    } catch (e: any) {
      const d = e?.response?.data
      setErr(d?.name?.[0] || d?.tax_id?.[0] || d?.detail || 'Xatolik yuz berdi')
    } finally { setLoading(false) }
  }

  const toggle = async (id: number, current: boolean) => {
    try { await apiClient.patch(`locations/${id}/`, { is_active: !current }); refresh() } catch {}
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 14, color: 'var(--subtext)' }}>Jami: <b style={{ color: 'var(--text)' }}>{locations.length} ta lokatsiya</b></span>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 10px rgba(99,102,241,0.3)' }}>
          <IcoPlus />Lokatsiya qo'shish
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {locations.map(loc => (
          <div key={loc.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{loc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 3 }}>{TYPE_LABELS[loc.location_type] || loc.location_type}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {loc.is_registered && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#10b98118', color: '#10b981', border: '1px solid #10b98130', fontWeight: 700 }}>✓ Ro'yxatda</span>
                )}
                <button onClick={() => toggle(loc.id, loc.is_active)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: loc.is_active ? '#10b98120' : '#ef444420', color: loc.is_active ? '#10b981' : '#ef4444', border: `1px solid ${loc.is_active ? '#10b98130' : '#ef444430'}`, cursor: 'pointer', fontFamily: 'Nunito' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: loc.is_active ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                  {loc.is_active ? 'Aktiv' : 'Nofaol'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--subtext)', marginBottom: 6 }}>📍 {loc.address}</div>
            {loc.tax_id && <div style={{ fontSize: 12, color: 'var(--subtext)' }}>STIR: {loc.tax_id}</div>}
          </div>
        ))}
        {locations.length === 0 && (
          <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '48px 0', color: 'var(--subtext)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div>Hali lokatsiyalar yo'q</div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Yangi lokatsiya qo'shish" onClose={() => { setShowAdd(false); setErr('') }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Nomi *</label>
              <input style={INP} placeholder="Masalan: Toshkent Cafe" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Manzil *</label>
              <input style={INP} placeholder="Shahar, ko'cha, uy raqami" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Turi *</label>
              <select style={SEL} value={form.location_type} onChange={e => setForm(f => ({ ...f, location_type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>STIR (INN) — ixtiyoriy</label>
              <input style={INP} placeholder="123456789" value={form.tax_id} onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))} />
            </div>
            {err && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>{err}</div>}
            <button onClick={create} disabled={loading} style={{ padding: 13, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Saqlanmoqda…' : '+ Lokatsiya qo\'shish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Boss accounts page ─────────────────────────────────────────────────────────
function BossesPage({ bosses, locations, refresh }: { bosses: BossT[]; locations: LocationT[]; refresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPwd, setShowPwd] = useState<BossT | null>(null)
  const [form, setForm] = useState({ username: '', full_name: '', password: '', location: '' })
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const create = async () => {
    if (!form.username || !form.full_name || !form.password) { setErr("Barcha majburiy maydonlar to'ldirilishi shart"); return }
    setLoading(true); setErr('')
    try {
      await apiClient.post('bosses/', { ...form, role: 'business_owner', location: form.location || null })
      await refresh(); setShowAdd(false)
      setForm({ username: '', full_name: '', password: '', location: '' })
    } catch (e: any) {
      const d = e?.response?.data
      setErr(d?.username?.[0] || d?.email?.[0] || d?.detail || 'Xatolik yuz berdi')
    } finally { setLoading(false) }
  }

  const toggle = async (id: number) => {
    try { await apiClient.post(`bosses/${id}/toggle_active/`); refresh() } catch {}
  }

  const remove = async (id: number) => {
    if (!confirm("Boss akkauntni o'chirishni tasdiqlaysizmi?")) return
    try { await apiClient.delete(`bosses/${id}/`); refresh() } catch {}
  }

  const changePass = async () => {
    if (!pwd || pwd.length < 4) { setErr("Parol kamida 4 belgidan iborat bo'lishi kerak"); return }
    setLoading(true); setErr('')
    try { await apiClient.post(`bosses/${showPwd!.id}/set_password/`, { password: pwd }); setShowPwd(null); setPwd('') }
    catch { setErr('Parol o\'zgartirishda xatolik') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 14, color: 'var(--subtext)' }}>Jami: <b style={{ color: 'var(--text)' }}>{bosses.length} ta boss</b></span>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 10px rgba(139,92,246,0.3)' }}>
          <IcoPlus />Boss qo'shish
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {bosses.map(boss => (
          <div key={boss.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {(boss.full_name || boss.username)[0]?.toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boss.full_name || boss.username}</div>
                <div style={{ fontSize: 12, color: 'var(--subtext)' }}>@{boss.username}</div>
              </div>
            </div>
            <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
              🏪 {boss.location_name || <span style={{ color: 'var(--subtext)', fontStyle: 'italic' }}>Lokatsiya belgilanmagan</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button onClick={() => toggle(boss.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: boss.is_active ? '#10b98120' : '#ef444420', color: boss.is_active ? '#10b981' : '#ef4444', border: `1px solid ${boss.is_active ? '#10b98130' : '#ef444430'}`, cursor: 'pointer', fontFamily: 'Nunito' }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: boss.is_active ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                {boss.is_active ? 'Faol' : 'Nofaol'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--subtext)' }}>{new Date(boss.date_joined).toLocaleDateString('uz')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setShowPwd(boss); setPwd(''); setErr('') }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 7, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--subtext)', fontFamily: 'Nunito', fontSize: 12, fontWeight: 600 }}>
                <IcoKey />Parol
              </button>
              <button onClick={() => remove(boss.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, cursor: 'pointer', color: '#ef4444', fontFamily: 'Nunito', fontSize: 12, fontWeight: 600 }}>
                <IcoTrash />O'chirish
              </button>
            </div>
          </div>
        ))}
        {bosses.length === 0 && (
          <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '48px 0', color: 'var(--subtext)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👔</div>
            <div>Hali boss akkauntlar yo'q</div>
          </div>
        )}
      </div>

      {/* Add boss modal */}
      {showAdd && (
        <Modal title="Yangi boss akkaunt" onClose={() => { setShowAdd(false); setErr('') }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>To'liq ism *</label>
              <input style={INP} placeholder="Aziz Karimov" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Login (username) *</label>
              <input style={INP} placeholder="aziz_karimov" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Parol *</label>
              <input style={INP} type="password" placeholder="Kamida 6 belgi" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--subtext)', display: 'block', marginBottom: 6 }}>Lokatsiya — ixtiyoriy</label>
              <select style={SEL} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                <option value="">Lokatsiya tanlanmagan</option>
                {locations.filter(l => l.is_active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {err && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>{err}</div>}
            <button onClick={create} disabled={loading} style={{ padding: 13, background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Saqlanmoqda…' : '+ Boss yaratish'}
            </button>
          </div>
        </Modal>
      )}

      {/* Password modal */}
      {showPwd && (
        <Modal title={`Parol: ${showPwd.full_name || showPwd.username}`} onClose={() => { setShowPwd(null); setErr('') }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input style={INP} type="password" placeholder="Yangi parol (kamida 4 belgi)" value={pwd} onChange={e => setPwd(e.target.value)} />
            {err && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>{err}</div>}
            <button onClick={changePass} disabled={loading} style={{ padding: 13, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Saqlanmoqda…' : 'Parolni o\'zgartirish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Staff overview page ────────────────────────────────────────────────────────
function StaffOverviewPage({ staff }: { staff: StaffT[] }) {
  const ROLE_LABELS: Record<string, string> = {
    waiter: 'Ofitsiant', cafe_manager: 'Menejer', kitchen: 'Oshpaz', cashier: 'Kassir',
  }
  const ROLE_COLORS: Record<string, string> = {
    waiter: '#f59e0b', cafe_manager: '#6366f1', kitchen: '#10b981', cashier: '#06b6d4',
  }

  return (
    <div>
      <div style={{ marginBottom: 18, fontSize: 14, color: 'var(--subtext)' }}>
        Jami: <b style={{ color: 'var(--text)' }}>{staff.length} ta xodim</b>
        {' · '}
        <span style={{ color: '#10b981' }}>{staff.filter(s => s.is_active).length} aktiv</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {staff.map(s => {
          const c = ROLE_COLORS[s.role] || '#6366f1'
          return (
            <div key={s.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: c + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: c, flexShrink: 0 }}>
                {(s.full_name || s.username)[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name || s.username}</div>
                <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: c, fontWeight: 700 }}>{ROLE_LABELS[s.role] || s.role}</span>
                  <span style={{ color: s.is_active ? '#10b981' : '#ef4444' }}>· {s.is_active ? 'Faol' : 'Nofaol'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {staff.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--subtext)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div>Xodimlar yo'q</div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SuperadminDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()
  const [active, setActive] = useState<Page>('overview')
  const [locations, setLocations] = useState<LocationT[]>([])
  const [bosses, setBosses] = useState<BossT[]>([])
  const [staff, setStaff] = useState<StaffT[]>([])

  const loadLocations = useCallback(async () => {
    try {
      const res = await apiClient.get('locations/')
      setLocations(Array.isArray(res.data) ? res.data : (res.data?.results ?? []))
    } catch {}
  }, [])

  const loadBosses = useCallback(async () => {
    try {
      const res = await apiClient.get('bosses/')
      setBosses(Array.isArray(res.data) ? res.data : (res.data?.results ?? []))
    } catch {}
  }, [])

  const loadStaff = useCallback(async () => {
    try {
      const res = await apiClient.get('cafe/staff/')
      setStaff(Array.isArray(res.data) ? res.data : (res.data?.results ?? []))
    } catch {}
  }, [])

  useEffect(() => {
    loadLocations(); loadBosses(); loadStaff()
  }, [loadLocations, loadBosses, loadStaff])

  const PAGE_TITLES: Record<Page, string> = {
    overview:  'Umumiy ko\'rinish',
    locations: 'Lokatsiyalar boshqaruvi',
    bosses:    'Boss akkauntlar',
    staff:     'Barcha xodimlar',
  }

  const renderPage = () => {
    if (active === 'overview')  return <OverviewPage locations={locations} bosses={bosses} staff={staff} />
    if (active === 'locations') return <LocationsPage locations={locations} refresh={loadLocations} />
    if (active === 'bosses')    return <BossesPage bosses={bosses} locations={locations} refresh={loadBosses} />
    if (active === 'staff')     return <StaffOverviewPage staff={staff} />
    return null
  }

  return (
    <div className="cafe-root" style={{ display: 'flex' }}>
      <Sidebar active={active} onNav={setActive} onLogout={() => { logout(); navigate('/login') }} user={user} />
      <div style={{ marginLeft: 230, flex: 1, padding: '24px 28px', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 2 }}>{PAGE_TITLES[active]}</h1>
            <div style={{ fontSize: 12, color: 'var(--subtext)' }}>{new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#6366f1' }}>
              🔐 Super Admin
            </div>
          </div>
        </div>
        {renderPage()}
      </div>
    </div>
  )
}
