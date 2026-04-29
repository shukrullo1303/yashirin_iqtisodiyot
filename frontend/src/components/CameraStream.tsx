import React, { useEffect, useRef, useState } from 'react'
import { Box, IconButton, Link, Typography } from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

interface StreamProps {
  streamUrl?: string | null
  isActive: boolean
  locationId?: number | null
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

function isWebEmbedStreamUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return (host === 'rtsp.me' || host.endsWith('.rtsp.me')) && u.pathname.includes('/embed/')
  } catch {
    return false
  }
}

interface LiveStats {
  employees: number
  customers: number
  daily_customers: number
  total: number
  live: boolean
}

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive, locationId }) => {
  const [key, setKey] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stats, setStats] = useState<LiveStats | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const embedMode = Boolean(streamUrl && isWebEmbedStreamUrl(streamUrl))
  const annotated = Boolean(streamUrl && locationId && !embedMode)

  // Reset stream when URL changes
  useEffect(() => {
    setHasError(false)
    setKey(k => k + 1)
    setStats(null)
  }, [streamUrl])

  // Retry on error
  const handleError = () => {
    setHasError(true)
    setTimeout(() => {
      setHasError(false)
      setKey(k => k + 1)
    }, 8000)
  }

  // Poll live-stats every 3s when stream is active and annotated
  useEffect(() => {
    if (!isActive || !streamUrl || !annotated) return

    let alive = true
    const load = async () => {
      try {
        const encoded = encodeURIComponent(streamUrl)
        const res = await fetch(`${API_BASE}/cameras/stream/live-stats/?url=${encoded}`, {
          credentials: 'include',
        })
        if (!res.ok || !alive) return
        const data: LiveStats = await res.json()
        setStats(data)
      } catch {
        // ignore
      }
    }

    load()
    const interval = window.setInterval(load, 3000)
    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [isActive, streamUrl, annotated])

  // Fullscreen change listener
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const streamSrc =
    streamUrl && isActive && !hasError && !embedMode
      ? `${API_BASE}/cameras/stream/?url=${encodeURIComponent(streamUrl)}${annotated ? `&annotated=1&location_id=${locationId}` : ''}`
      : null

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: isFullscreen ? '100vh' : 240,
        bgcolor: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Video */}
      {embedMode && streamUrl ? (
        <>
          <iframe
            src={streamUrl}
            title="Kamera oqimi"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.75)', px: 1, py: 0.5 }}>
            <Typography variant="caption" color="grey.200">
              RTSP.ME embed — faqat ko'rish.{' '}
              <Link href={streamUrl} target="_blank" rel="noopener noreferrer" color="primary.light">
                To'liq oynada ochish
              </Link>
            </Typography>
          </Box>
        </>
      ) : streamSrc ? (
        <img
          key={key}
          src={streamSrc}
          alt="Live stream"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={handleError}
        />
      ) : (
        <Typography color="grey.600" variant="caption" sx={{ textAlign: 'center', px: 2 }}>
          {streamUrl
            ? hasError
              ? '⚠ Offline · 8s da qayta urinadi...'
              : 'Yuklanmoqda...'
            : 'Kamera nofaol'}
        </Typography>
      )}

      {/* LIVE badge */}
      {streamSrc && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8,
          bgcolor: 'rgba(210,0,0,0.88)', px: 1, py: 0.3,
          borderRadius: 0.75, display: 'flex', alignItems: 'center', gap: 0.5,
        }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#fff', animation: 'pulse 1.2s infinite' }} />
          <Typography variant="caption" color="white" fontWeight="bold" fontSize={10}>LIVE</Typography>
        </Box>
      )}

      {/* Fullscreen toggle */}
      <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
        <IconButton
          size="small"
          onClick={async () => {
            const el = containerRef.current
            if (!el) return
            if (!document.fullscreenElement) await el.requestFullscreen()
            else await document.exitFullscreen()
          }}
          sx={{ bgcolor: 'rgba(0,0,0,0.55)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, p: 0.5 }}
        >
          {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Bottom-right stats overlay */}
      {streamSrc && (
        <Box sx={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          bgcolor: 'rgba(10,10,10,0.78)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 1.5,
          px: 1.5,
          py: 1,
          backdropFilter: 'blur(6px)',
          minWidth: 130,
        }}>
          {/* Xodimlar — ko'k */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.6 }}>
            <Box sx={{
              width: 10, height: 10, borderRadius: '50%',
              bgcolor: '#4a90e2',
              boxShadow: '0 0 6px #4a90e2aa',
              flexShrink: 0,
            }} />
            <Typography variant="caption" sx={{ color: '#c8d8f0', fontWeight: 700, fontSize: 11, lineHeight: 1 }}>
              Xodimlar:
            </Typography>
            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1, ml: 'auto' }}>
              {stats?.employees ?? '—'}
            </Typography>
          </Box>

          {/* Mijozlar — sariq */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              width: 10, height: 10, borderRadius: '50%',
              bgcolor: '#f5c842',
              boxShadow: '0 0 6px #f5c842aa',
              flexShrink: 0,
            }} />
            <Typography variant="caption" sx={{ color: '#f5e8b0', fontWeight: 700, fontSize: 11, lineHeight: 1 }}>
              Mijozlar:
            </Typography>
            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1, ml: 'auto' }}>
              {stats?.customers ?? '—'}
            </Typography>
          </Box>

          {/* Divider + daily */}
          {stats && stats.daily_customers > 0 && (
            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', mt: 0.8, pt: 0.6 }}>
              <Typography variant="caption" sx={{ color: 'grey.500', fontSize: 10 }}>
                Bugungi: <b style={{ color: '#aaa' }}>{stats.daily_customers}</b> ta
              </Typography>
            </Box>
          )}

          {/* Live indicator dot */}
          {stats && !stats.live && (
            <Typography variant="caption" sx={{ color: 'grey.600', fontSize: 9, display: 'block', mt: 0.4 }}>
              (tahlil kutilmoqda)
            </Typography>
          )}
        </Box>
      )}

      {/* Pulse keyframe */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  )
}

export default CameraStream
