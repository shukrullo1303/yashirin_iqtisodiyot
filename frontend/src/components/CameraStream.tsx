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

/** rtsp.me /embed/ pages — show via iframe, not OpenCV */
function isWebEmbedStreamUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return (host === 'rtsp.me' || host.endsWith('.rtsp.me')) && u.pathname.includes('/embed/')
  } catch {
    return false
  }
}

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive, locationId }) => {
  const [key, setKey] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stats, setStats] = useState<{ customers?: number; employees?: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const embedMode = Boolean(streamUrl && isWebEmbedStreamUrl(streamUrl))

  // Reset stream when URL changes
  useEffect(() => {
    setHasError(false)
    setKey((k) => k + 1)
  }, [streamUrl])

  // Retry after 8s on error
  const handleError = () => {
    setHasError(true)
    setTimeout(() => {
      setHasError(false)
      setKey((k) => k + 1)
    }, 8000)
  }

  // Dashboard stats — fetch once on mount then every 30s (not per-second)
  useEffect(() => {
    if (!isActive || embedMode) return undefined

    let alive = true
    const load = async () => {
      try {
        const locParam = locationId ? `&location_id=${encodeURIComponent(String(locationId))}` : ''
        const res = await fetch(`${API_BASE}/dashboard/stats/?${locParam}`, { credentials: 'include' })
        if (!res.ok || !alive) return
        const data = await res.json()
        setStats({
          customers: typeof data?.customers === 'number' ? data.customers : undefined,
          employees: typeof data?.employees === 'number' ? data.employees : undefined,
        })
      } catch {
        // ignore
      }
    }

    load()
    const interval = window.setInterval(load, 30_000)
    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [isActive, locationId, embedMode])

  // Fullscreen change listener
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // MJPEG stream src — annotated=1 when we have a locationId for face overlay
  const streamSrc =
    streamUrl && isActive && !hasError && !embedMode
      ? `${API_BASE}/cameras/stream/?url=${encodeURIComponent(streamUrl)}${locationId ? `&annotated=1&location_id=${locationId}` : ''}`
      : null

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: isFullscreen ? '100vh' : 220,
        bgcolor: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
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
            <Typography variant="caption" color="grey.200" component="span">
              RTSP.ME embed — faqat ko'rish. Yuz tahlili uchun{' '}
              <strong>rtsp://...</strong> yoki <strong>HTTP MJPEG</strong> manzilini kiriting.{' '}
              <Link href={streamUrl} target="_blank" rel="noopener noreferrer" color="primary.light" underline="always">
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
        <Typography color="white" variant="caption">
          {streamUrl
            ? hasError
              ? 'Offline · 8s da qayta urinadi...'
              : 'Yuklanmoqda...'
            : 'Kamera nofaol'}
        </Typography>
      )}

      {/* LIVE badge */}
      {streamSrc && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(220,0,0,0.85)', px: 1, py: 0.25, borderRadius: 0.5 }}>
          <Typography variant="caption" color="white" fontWeight="bold">LIVE</Typography>
        </Box>
      )}

      {/* Fullscreen toggle */}
      <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
        <IconButton
          size="small"
          onClick={async () => {
            const el = containerRef.current
            if (!el) return
            if (!document.fullscreenElement) {
              await el.requestFullscreen()
            } else {
              await document.exitFullscreen()
            }
          }}
          sx={{ bgcolor: 'rgba(0,0,0,0.55)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
        >
          {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Stats overlay */}
      {stats && (typeof stats.customers === 'number' || typeof stats.employees === 'number') && (
        <Box sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'rgba(0,0,0,0.65)', px: 1, py: 0.5, borderRadius: 1 }}>
          <Typography variant="caption" color="grey.100" sx={{ display: 'block', fontWeight: 600 }}>
            Xodimlar: {stats.employees ?? '-'} ta
          </Typography>
          <Typography variant="caption" color="grey.100" sx={{ display: 'block', fontWeight: 600 }}>
            Mijozlar: {stats.customers ?? '-'} ta
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default CameraStream
