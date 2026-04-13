import React, { useEffect, useMemo, useState } from 'react'
import { Box, Link, Typography } from '@mui/material'

interface StreamProps {
  streamUrl?: string | null
  isActive: boolean
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

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive }) => {
  const [hasError, setHasError] = useState(false)
  const [tick, setTick] = useState(0)
  const [sessionKey, setSessionKey] = useState(Date.now())

  const embedMode = Boolean(streamUrl && isWebEmbedStreamUrl(streamUrl))

  const streamEndpoint = useMemo(() => {
    if (!streamUrl || embedMode) {
      return null
    }

    return `${API_BASE}/cameras/stream/snapshot/?url=${encodeURIComponent(streamUrl)}&t=${tick}&session=${sessionKey}`
  }, [streamUrl, tick, sessionKey, embedMode])

  useEffect(() => {
    setHasError(false)
    setTick(0)
    setSessionKey(Date.now())
  }, [streamUrl])

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

  return (
    <Box
      sx={{
        width: '100%',
        height: 220,
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
    </Box>
  )
}

export default CameraStream