import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { orderApi } from '../../api/cafe'

interface OrderItemT { id: number; menu_item_name: string; quantity: number }
interface OrderT { id: number; table_name: string; status: string; note: string; opened_at: string; items: OrderItemT[] }

function elapsed(opened_at: string): string {
  const diff = Math.floor((Date.now() - new Date(opened_at).getTime()) / 60000)
  if (diff < 1) return 'Hozir'
  return `${diff} daq`
}

function urgencyColor(opened_at: string): string {
  const diff = Math.floor((Date.now() - new Date(opened_at).getTime()) / 60000)
  if (diff >= 20) return '#d94545'
  if (diff >= 10) return '#e8a820'
  return '#2d9e6b'
}

export default function KitchenDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuthStore()
  const [orders, setOrders] = useState<OrderT[]>([])
  const [loading, setLoading] = useState(true)
  const [, tick] = useState(0)

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderApi.today()
      const all: OrderT[] = Array.isArray(res.data) ? res.data : (res.data.results ?? [])
      setOrders(all.filter(o => o.status === 'open' || o.status === 'ready'))
    } catch {}
  }, [])

  useEffect(() => {
    ;(async () => { setLoading(true); await loadOrders(); setLoading(false) })()
    const poll = setInterval(loadOrders, 20000)
    const clock = setInterval(() => tick(n => n + 1), 30000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [loadOrders])

  const markReady = async (id: number) => {
    try { await orderApi.updateStatus(id, 'ready'); await loadOrders() } catch {}
  }

  const openOrders = orders.filter(o => o.status === 'open')
  const readyOrders = orders.filter(o => o.status === 'ready')

  if (loading) return (
    <div className="cafe-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>Yuklanmoqda…</div>
    </div>
  )

  return (
    <div className="cafe-root" style={{ minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, #d94545 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🍳</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.3px' }}>Oshxona paneli</div>
            <div style={{ fontSize: 11, color: 'var(--subtext)', fontWeight: 600 }}>{user?.full_name || 'Oshpaz'}</div>
          </div>
        </div>

        {/* Live KPI pills */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: openOrders.length > 0 ? '#d9454522' : 'var(--card)', border: `1px solid ${openOrders.length > 0 ? '#d9454544' : 'var(--border)'}`, borderRadius: 20, padding: '6px 16px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: openOrders.length > 0 ? '#d94545' : 'var(--subtext)', display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: openOrders.length > 0 ? '#d94545' : 'var(--subtext)' }}>{openOrders.length}</span>
            <span style={{ fontSize: 12, color: 'var(--subtext)', fontWeight: 600 }}>yangi</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: readyOrders.length > 0 ? '#2d9e6b22' : 'var(--card)', border: `1px solid ${readyOrders.length > 0 ? '#2d9e6b44' : 'var(--border)'}`, borderRadius: 20, padding: '6px 16px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: readyOrders.length > 0 ? '#2d9e6b' : 'var(--subtext)', display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: readyOrders.length > 0 ? '#2d9e6b' : 'var(--subtext)' }}>{readyOrders.length}</span>
            <span style={{ fontSize: 12, color: 'var(--subtext)', fontWeight: 600 }}>tayyor</span>
          </div>
        </div>

        <button onClick={() => { logout(); navigate('/login') }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtext)', padding: '6px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 600, fontSize: 12 }}>Chiqish</button>
      </div>

      <div style={{ padding: '24px' }}>

        {/* ── Pending orders ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Tayyorlash kerak</h2>
          {openOrders.length > 0 && (
            <span style={{ background: '#d94545', color: '#fff', borderRadius: 10, width: 22, height: 22, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{openOrders.length}</span>
          )}
        </div>

        {openOrders.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px', textAlign: 'center', marginBottom: 28, color: 'var(--subtext)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Hozircha yangi zakaz yo'q</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Yangi zakazlar avtomatik paydo bo'ladi</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
            {openOrders.map(order => {
              const uc = urgencyColor(order.opened_at)
              const el = elapsed(order.opened_at)
              return (
                <div key={order.id} style={{ background: 'var(--card)', border: `2px solid ${uc}55`, borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800 }}>{order.table_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 2 }}>
                        #{order.id} · {new Date(order.opened_at).toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: uc, lineHeight: 1 }}>{el}</div>
                      <div style={{ fontSize: 10, color: 'var(--subtext)', fontWeight: 600, marginTop: 2 }}>kutilmoqda</div>
                    </div>
                  </div>

                  {/* Urgency bar */}
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                    <div style={{ height: 3, borderRadius: 2, background: uc, width: `${Math.min(100, (Date.now() - new Date(order.opened_at).getTime()) / 1200000 * 100)}%`, transition: 'width 0.5s ease' }} />
                  </div>

                  {/* Items */}
                  <div style={{ background: 'var(--card2)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {order.items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{item.menu_item_name}</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--accent)', background: 'var(--accent)22', borderRadius: 8, padding: '2px 10px' }}>×{item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  {order.note && (
                    <div style={{ fontSize: 12, color: '#e8a820', background: '#e8a82011', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #e8a820' }}>
                      📝 {order.note}
                    </div>
                  )}

                  {/* Ready button */}
                  <button onClick={() => markReady(order.id)} style={{ width: '100%', padding: '13px', background: '#2d9e6b', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, transition: 'all 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#34b87c')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#2d9e6b')}
                  >
                    ✓ Tayyor!
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Ready orders ── */}
        {readyOrders.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#2d9e6b' }}>Tayyor — Ofitsiant kutmoqda</h2>
              <span style={{ background: '#2d9e6b', color: '#fff', borderRadius: 10, width: 22, height: 22, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{readyOrders.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {readyOrders.map(order => (
                <div key={order.id} style={{ background: 'var(--card)', border: '2px solid #2d9e6b44', borderRadius: 16, padding: 18, opacity: 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{order.table_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--subtext)', marginTop: 2 }}>#{order.id}</div>
                    </div>
                    <span style={{ padding: '4px 12px', borderRadius: 20, background: '#2d9e6b22', color: '#2d9e6b', fontSize: 12, fontWeight: 700, border: '1px solid #2d9e6b44' }}>
                      Tayyor ✓
                    </span>
                  </div>
                  <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {order.items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'var(--subtext)' }}>{item.menu_item_name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#2d9e6b' }}>×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--subtext)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🍽️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Oshxona tinch</div>
            <div style={{ fontSize: 13 }}>Yangi zakazlar kelishi bilan bu yerda ko'rinadi</div>
          </div>
        )}
      </div>
    </div>
  )
}
