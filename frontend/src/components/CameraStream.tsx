import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, Link, Typography } from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

interface StreamProps {
  streamUrl?: string | null
  isActive: boolean
  locationId?: number | null
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

/** rtsp.me va o‘xshash xizmatlarning /embed/ sahifasi — OpenCV emas, brauzer iframe orqali ko‘rsatiladi */
function isWebEmbedStreamUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host === 'rtsp.me' || host.endsWith('.rtsp.me')) {
      return u.pathname.includes('/embed/')
    }
    return false
  } catch {
    return false
  }
}

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive, locationId }) => {
  const [hasError, setHasError] = useState(false)
  const [tick, setTick] = useState(0)
  const [sessionKey, setSessionKey] = useState(Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stats, setStats] = useState<{ customers?: number; employees?: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const embedMode = Boolean(streamUrl && isWebEmbedStreamUrl(streamUrl))

  const streamEndpoint = useMemo(() => {
    if (!streamUrl || embedMode) {
      return null
    }

    // annotated=1: real-time bbox/label overlay (backend)
    return `${API_BASE}/cameras/stream/snapshot/?url=${encodeURIComponent(streamUrl)}&annotated=1&t=${tick}&session=${sessionKey}`
  }, [streamUrl, tick, sessionKey, embedMode])

  useEffect(() => {
    setHasError(false)
    setTick(0)
    setSessionKey(Date.now())
  }, [streamUrl])

  useEffect(() => {
    if (!isActive) return undefined

    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/dashboard/stats/?location_id=${encodeURIComponent(String(locationId ?? ''))}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        if (!alive) return
        setStats({
          customers: typeof data?.customers === 'number' ? data.customers : undefined,
          employees: typeof data?.employees === 'number' ? data.employees : undefined,
        })
      } catch {
        // ignore
      }
    }

    load()
    const interval = window.setInterval(load, 2000)
    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [isActive, locationId])

  useEffect(() => {
    if (!streamUrl || embedMode) {
      return undefined
    }

    const interval = window.setInterval(() => setTick((prev) => prev + 1), 1000)
    return () => window.clearInterval(interval)
  }, [streamUrl, embedMode])

  useEffect(() => {
    if (!streamUrl || embedMode) {
      return undefined
    }

    const reconnectInterval = window.setInterval(() => {
      setSessionKey(Date.now())
    }, 5 * 60 * 1000) // 5 minutes

    return () => window.clearInterval(reconnectInterval)
  }, [streamUrl, embedMode])

  useEffect(() => {
    if (!hasError) {
      return undefined
    }

    const timeout = window.setTimeout(() => setHasError(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [hasError])

  useEffect(() => {
    if (!isFullscreen) return
    const onChange = () => {
      const fs = Boolean(document.fullscreenElement)
      setIsFullscreen(fs)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [isFullscreen])

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
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              bgcolor: 'rgba(0,0,0,0.75)',
              px: 1,
              py: 0.5,
            }}
          >
            <Typography variant="caption" color="grey.200" component="span">
              RTSP.ME embed — faqat ko‘rish. Yuz tahlili uchun kameraning o‘z{' '}
              <strong>rtsp://...</strong> yoki <strong>HTTP MJPEG</strong> manzilini Stream URL ga kiriting.{' '}
              <Link href={streamUrl} target="_blank" rel="noopener noreferrer" color="primary.light" underline="always">
                To‘liq oynada ochish
              </Link>
            </Typography>
          </Box>
        </>
      ) : streamEndpoint && !hasError ? (
        <img
          src={streamEndpoint}
          alt="Live stream"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => {
            setHasError(true)
          }}
        />
      ) : (
        <Typography color="white">
          {streamUrl ? 'Tasvir yuklanmadi, qayta urinmoqda...' : 'Kamera nofaol'}
        </Typography>
      )}

      {streamEndpoint && !embedMode && (
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            left: 10,
            bgcolor: 'rgba(255,0,0,0.7)',
            px: 1,
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" color="white" sx={{ fontWeight: 'bold' }}>
            LIVE
          </Typography>
        </Box>
      )}

      <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={async () => {
            const el = containerRef.current
            if (!el) return
            if (!document.fullscreenElement) {
              await el.requestFullscreen()
              setIsFullscreen(true)
            } else {
              await document.exitFullscreen()
              setIsFullscreen(false)
            }
          }}
          sx={{ bgcolor: 'rgba(0,0,0,0.55)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
        >
          {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>
      </Box>

      {stats && (typeof stats.customers === 'number' || typeof stats.employees === 'number') ? (
        <Box
          sx={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            bgcolor: 'rgba(0,0,0,0.65)',
            px: 1,
            py: 0.5,
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" color="grey.100" sx={{ display: 'block', fontWeight: 600 }}>
            Xodimlar: {stats.employees ?? '-'} ta
          </Typography>
          <Typography variant="caption" color="grey.100" sx={{ display: 'block', fontWeight: 600 }}>
            Mijozlar: {stats.customers ?? '-'} ta
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}

export default CameraStream