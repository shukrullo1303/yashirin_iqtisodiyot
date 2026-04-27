import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { menuApi, tableApi, orderApi } from '../../api/cafe'

interface TableStatus { has_open_order: boolean; order_id: number | null; item_count: number }
interface TableT { id: number; number: number; name: string; capacity: number; status: TableStatus }
interface MenuItemT { id: number; name: string; price: string; is_available: boolean }
interface CategoryT { id: number; name: string; items: MenuItemT[] }
interface CartItem { menu_item: number; name: string; price: number; quantity: number }
interface OrderItem { menu_item_name: string; quantity: number }
interface OrderT { id: number; table_name: string; status: string; opened_at: string; items: OrderItem[] }
type View = 'tables' | 'order' | 'status'

function IcoTable() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="4" rx="1"/><line x1="6" y1="12" x2="6" y2="17"/><line x1="18" y1="12" x2="18" y2="17"/><line x1="4" y1="19" x2="20" y2="19"/></svg>
}
function IcoOrder() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
}
function IcoClock() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}

const sColor = (s: string) => ({ open: '#7c6ff7', ready: '#2d9e6b', paid: '#987060', cancelled: '#d94545' }[s] || '#9a7060')
const sLabel = (s: string) => ({ open: 'Oshxonada', ready: 'Tayyor ✓', paid: "To'langan", cancelled: 'Bekor' }[s] || s)

export default function WaiterDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()
  const [view, setView] = useState<View>('tables')
  const [tables, setTables] = useState<TableT[]>([])
  const [categories, setCategories] = useState<CategoryT[]>([])
  const [activeCat, setActiveCat] = useState(0)
  const [selectedTable, setSelectedTable] = useState<TableT | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [todayOrders, setTodayOrders] = useState<OrderT[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [orderSent, setOrderSent] = useState(false)

  const loadTables = useCallback(async () => {
    try {
      const res = await tableApi.list()
      setTables(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderApi.today()
      setTodayOrders(Array.isArray(res.data) ? res.data : (res.data.results ?? []))
    } catch {}
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await Promise.all([loadTables(), loadOrders()])
      setLoading(false)
    })()
    const t = setInterval(() => { loadTables(); loadOrders() }, 30000)
    return () => clearInterval(t)
  }, [loadTables, loadOrders])

  const openOrderView = async (table: TableT) => {
    setSelectedTable(table)
    setCart([])
    setView('order')
    if (categories.length === 0) {
      try {
        const res = await menuApi.categories()
        const cats: CategoryT[] = Array.isArray(res.data) ? res.data : (res.data.results ?? [])
        setCategories(cats)
        if (cats.length) setActiveCat(cats[0].id)
      } catch {}
    }
  }

  const addItem = (item: MenuItemT) => {
    setCart(prev => {
      const ex = prev.find(c => c.menu_item === item.id)
      if (ex) return prev.map(c => c.menu_item === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { menu_item: item.id, name: item.name, price: parseFloat(item.price), quantity: 1 }]
    })
  }

  const removeItem = (id: number) => {
    setCart(prev => {
      const ex = prev.find(c => c.menu_item === id)
      if (!ex) return prev
      if (ex.quantity <= 1) return prev.filter(c => c.menu_item !== id)
      return prev.map(c => c.menu_item === id ? { ...c, quantity: c.quantity - 1 } : c)
    })
  }

  const sendToKitchen = async () => {
    if (!selectedTable || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await orderApi.create({ table: selectedTable.id })
      await orderApi.addItems(res.data.id, cart.map(c => ({ menu_item: c.menu_item, quantity: c.quantity })))
      setOrderSent(true)
      setTimeout(async () => {
        await Promise.all([loadTables(), loadOrders()])
        setOrderSent(false)
        setCart([])
        setView('status')
      }, 1400)
    } catch { alert('Zakaz yuborishda xatolik') }
    finally { setSubmitting(false) }
  }

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const busyCount = tables.filter(t => t.status.has_open_order).length
  const freeCount = tables.length - busyCount
  const activeOrders = todayOrders.filter(o => o.status === 'open' || o.status === 'ready')

  const NAV = [
    { id: 'tables' as View, label: 'Stollar', icon: <IcoTable /> },
    { id: 'order' as View, label: 'Buyurtma', icon: <IcoOrder /> },
    { id: 'status' as View, label: 'Holat', icon: <IcoClock /> },
  ]

  if (loading) return (
    <div className="cafe-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>Yuklanmoqda…</div>
    </div>
  )

  return (
    <div className="cafe-root" style={{ display: 'flex', flexDirection: 'column', maxWidth: 780, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #2d9e6b 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>☕</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{user?.full_name || 'Ofitsiant'}</div>
            <div style={{ fontSize: 11, color: 'var(--subtext)' }}>Ofitsiant</div>
          </div>
        </div>
        {view === 'order' && selectedTable && (
          <div style={{ background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
            Stol {selectedTable.number} · {cart.length} ta
          </div>
        )}
        <button onClick={() => { logout(); navigate('/login') }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtext)', padding: '6px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 600, fontSize: 12 }}>Chiqish</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>

        {/* ── TABLES ── */}
        {view === 'tables' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Stol tanlang</h2>
            <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
              {[{ label: "Bo'sh", color: '#2d9e6b', count: freeCount }, { label: 'Band', color: '#d4621e', count: busyCount }].map((s, i) => (
                <div key={i} style={{ flex: 1, background: 'var(--card)', border: `1px solid ${s.color}33`, borderRadius: 12, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: 'var(--subtext)', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {tables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--subtext)' }}>Stol topilmadi. Admin stollarni qo'shishi kerak.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {tables.map(t => {
                  const busy = t.status.has_open_order
                  const c = busy ? '#d4621e' : '#2d9e6b'
                  return (
                    <button key={t.id} onClick={() => openOrderView(t)}
                      style={{ background: 'var(--card)', border: `2px solid ${c}33`, borderRadius: 16, padding: '18px 14px', cursor: 'pointer', textAlign: 'center', fontFamily: 'Nunito', transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = c)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = c + '33')}
                    >
                      <div style={{ fontSize: 24, fontWeight: 800, color: c, marginBottom: 3 }}>{t.number}</div>
                      <div style={{ fontSize: 11, color: 'var(--subtext)', marginBottom: 8, fontWeight: 600 }}>{t.capacity} o'rin</div>
                      <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: c + '22', color: c, fontSize: 11, fontWeight: 700 }}>
                        {busy ? `${t.status.item_count} ta mahsulot` : "Bo'sh"}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ORDER ── */}
        {view === 'order' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 14, minHeight: 'calc(100vh - 170px)' }}>
            {/* Left: menu */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: activeCat === cat.id ? 'var(--accent)' : 'var(--card)', color: activeCat === cat.id ? '#fff' : 'var(--subtext)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'Nunito', transition: 'all 0.13s' }}>{cat.name}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                {(categories.find(c => c.id === activeCat)?.items ?? []).filter(i => i.is_available).map(item => {
                  const inCart = cart.find(c => c.menu_item === item.id)
                  return (
                    <button key={item.id} onClick={() => addItem(item)} style={{ background: inCart ? 'var(--accent)11' : 'var(--card)', border: `2px solid ${inCart ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 14, padding: '14px 10px', cursor: 'pointer', textAlign: 'center', fontFamily: 'Nunito', transition: 'all 0.13s' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{item.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{parseFloat(item.price).toLocaleString()} so'm</div>
                      {inCart && <div style={{ marginTop: 6, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 8px', display: 'inline-block', fontSize: 12, fontWeight: 800 }}>x{inCart.quantity}</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: cart */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 80, maxHeight: 'calc(100vh - 180px)' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Stol {selectedTable?.number} — Buyurtma</div>
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {cart.length === 0 ? (
                  <div style={{ color: 'var(--subtext)', fontSize: 13, textAlign: 'center', padding: '28px 0' }}>Chap tomondan taom tanlang</div>
                ) : cart.map(item => (
                  <div key={item.menu_item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--subtext)' }}>{item.price.toLocaleString()} so'm</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => removeItem(item.menu_item)} style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--border)', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--text)', fontFamily: 'Nunito', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 800, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => addItem({ id: item.menu_item, name: item.name, price: String(item.price), is_available: true })} style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#fff', fontFamily: 'Nunito', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>Jami:</span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>{total.toLocaleString()} so'm</span>
                  </div>
                  <button onClick={sendToKitchen} disabled={submitting || orderSent} style={{ padding: 13, background: orderSent ? '#2d9e6b' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, cursor: orderSent ? 'default' : 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, transition: 'all 0.2s' }}>
                    {orderSent ? '✓ Oshxonaga yuborildi!' : '🍳 Oshxonaga yuborish'}
                  </button>
                </>
              )}
              <button onClick={() => setView('tables')} style={{ padding: 10, background: 'transparent', color: 'var(--subtext)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 600, fontSize: 13 }}>← Orqaga</button>
            </div>
          </div>
        )}

        {/* ── STATUS ── */}
        {view === 'status' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Buyurtmalar holati</h2>
            {activeOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--subtext)' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Barcha buyurtmalar bajarildi!</div>
              </div>
            ) : activeOrders.map(o => {
              const c = sColor(o.status)
              const stepIdx = o.status === 'ready' ? 1 : 0
              return (
                <div key={o.id} style={{ background: 'var(--card)', border: `1px solid ${c}33`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--accent)' }}>#{o.id}</span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{o.table_name}</span>
                    </div>
                    <span style={{ padding: '5px 13px', borderRadius: 20, background: c + '22', color: c, fontSize: 13, fontWeight: 700 }}>{sLabel(o.status)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
                    {['Oshxonada', 'Tayyor'].map((label, si) => (
                      <React.Fragment key={label}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: si <= stepIdx ? c : 'var(--border)', color: si <= stepIdx ? '#fff' : 'var(--subtext)', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{si + 1}</div>
                        {si < 1 && <div style={{ flex: 1, height: 3, borderRadius: 2, background: si < stepIdx ? c : 'var(--border)' }} />}
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: o.status === 'ready' ? 12 : 0 }}>
                    {o.items.map((item, j) => (
                      <span key={j} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)' }}>{item.menu_item_name} x{item.quantity}</span>
                    ))}
                  </div>
                  {o.status === 'ready' && (
                    <button onClick={async () => { await orderApi.updateStatus(o.id, 'paid'); loadOrders() }} style={{ width: '100%', padding: 11, background: '#2d9e6b', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14 }}>
                      Stolga olib chiqdim ✓
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', padding: '8px 12px 14px', position: 'sticky', bottom: 0, gap: 4 }}>
        {NAV.map(item => {
          const isActive = view === item.id
          const badge = item.id === 'status' ? activeOrders.length : 0
          return (
            <button key={item.id} onClick={() => setView(item.id)} style={{ flex: 1, padding: '10px 8px', borderRadius: 14, background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#fff' : 'var(--subtext)', border: 'none', cursor: 'pointer', fontFamily: 'Nunito', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative', transition: 'all 0.13s' }}>
              {item.icon}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{ position: 'absolute', top: 6, right: '50%', transform: 'translateX(14px)', background: '#d94545', color: '#fff', borderRadius: 10, width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
