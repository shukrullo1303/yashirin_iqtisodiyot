import React, { useEffect, useRef, useState } from 'react'
import { Box, IconButton, Link, Typography } from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import apiClient from '../api/client'
import { createSharedWebcamPool } from '../utils/sharedWebcam'

interface StreamProps {
  cameraId?: number | null
  streamUrl?: string | null
  isActive: boolean
  locationId?: number | null
}

interface AiDetection {
  bbox: [number, number, number, number]
  label: string
  is_employee: boolean
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

// Ikki local webcam karta bir vaqtda render bo'lganda har biri "default"
// kamerani so'rab, bir-birining oqimini uzib qo'ymasligi uchun qurilmalar
// ro'yxatini faqat bir marta olamiz. Shundan keyin har kartaga aniq deviceId
// beriladi: 0 — birinchi webcam, 1 — ikkinchi webcam.
let localVideoDeviceIdsPromise: Promise<string[]> | null = null
const localStreams = createSharedWebcamPool(deviceId => navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: deviceId } }, audio: false,
}))

const getLocalVideoDeviceIds = async (): Promise<string[]> => {
  if (!localVideoDeviceIdsPromise) {
    localVideoDeviceIdsPromise = (async () => {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        return devices.filter((device) => device.kind === 'videoinput').map((device) => device.deviceId)
      } finally {
        permissionStream.getTracks().forEach((track) => track.stop())
      }
    })().catch((error) => {
      localVideoDeviceIdsPromise = null
      throw error
    })
  }
  return localVideoDeviceIdsPromise
}

function isWebEmbedStreamUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return (host === 'rtsp.me' || host.endsWith('.rtsp.me')) && u.pathname.includes('/embed/')
  } catch {
    return false
  }
}

const CameraStream: React.FC<StreamProps> = ({ cameraId, streamUrl, isActive, locationId }) => {
  const [key, setKey] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [localRetry, setLocalRetry] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [localDetections, setLocalDetections] = useState<AiDetection[]>([])
  const [detectionSize, setDetectionSize] = useState({ width: 0, height: 0 })

  const embedMode = Boolean(streamUrl && isWebEmbedStreamUrl(streamUrl))
  const localWebcam = Boolean(streamUrl && /^\d+$/.test(streamUrl.trim()))
  // Operator real vaqtda odam/yuz aniqlanganini ko‘rishi kerak.
  const annotated = true

  // Reset stream when URL changes
  useEffect(() => {
    setHasError(false)
    setKey(k => k + 1)
  }, [streamUrl])

  // Numeric sources (0, 1, ...) are local USB webcams. Windows can deny a
  // background Django process access to these devices, while the visible
  // browser is permitted to use them. Keep RTSP/HTTP cameras on the server
  // stream path, but show local demo webcams directly and reliably here.
  useEffect(() => {
    if (!localWebcam || !isActive || !navigator.mediaDevices?.getUserMedia) return
    let releaseStream: (() => void) | undefined
    let retryTimer: number | undefined
    let cancelled = false
    const video = videoRef.current

    const openLocalWebcam = async () => {
      try {
        const requestedIndex = Number(streamUrl)
        const deviceIds = await getLocalVideoDeviceIds()
        if (cancelled) {
          return
        }
        const deviceId = deviceIds[requestedIndex]
        if (!deviceId) {
          throw new Error(`Webcam ${requestedIndex} topilmadi`)
        }
        // Har bir kamera o'zining aniq fizik deviceId bilan ochiladi. Bir
        // xil test webcam ikkinchi marta so'ralmaydi.
        const lease = await localStreams.acquire(deviceId)
        releaseStream = lease.release
        if (cancelled) {
          releaseStream()
          return
        }
        if (video) {
          video.srcObject = lease.stream
          await video.play()
        }
        if (!cancelled) setHasError(false)
      } catch {
        releaseStream?.()
        if (cancelled) return
        setHasError(true)
        localVideoDeviceIdsPromise = null
        retryTimer = window.setTimeout(() => {
          setHasError(false)
          setLocalRetry(value => value + 1)
        }, 8000)
      }
    }

    openLocalWebcam()
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
      if (video) video.srcObject = null
      releaseStream?.()
    }
  }, [localWebcam, isActive, streamUrl, localRetry])

  // Browser webcamining kadri backendga uzatiladi: tashrif qaydi va sariq
  // yuz ramkasi serverdagi ayni AI model bilan hosil qilinadi.
  useEffect(() => {
    if (!localWebcam || !isActive || !cameraId) return
    let stopped = false
    let busy = false
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    const analyseFrame = async () => {
      const video = videoRef.current
      if (stopped || busy || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !context) return
      busy = true
      try {
        // AI uchun kichikroq kadr yetarli; yuqori sifatdagi jonli video
        // brauzerning o'zidan uzluksiz ko'rinadi.
        const sourceWidth = video.videoWidth || 640
        const sourceHeight = video.videoHeight || 480
        canvas.width = Math.min(400, sourceWidth)
        canvas.height = Math.max(1, Math.round(sourceHeight * (canvas.width / sourceWidth)))
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.68))
        if (!blob || stopped) return
        const formData = new FormData()
        formData.append('frame', blob, 'local-webcam.jpg')
        const response = await apiClient.post(`cameras/local-frame/?camera_id=${cameraId}`, formData)
        if (stopped) return
        setLocalDetections(Array.isArray(response.data?.detections) ? response.data.detections : [])
        setDetectionSize({ width: Number(response.data?.width) || canvas.width, height: Number(response.data?.height) || canvas.height })
      } catch {
        // Tasvir ko‘rsatishni to‘xtatmaymiz; keyingi sekundda qayta urinadi.
      } finally {
        busy = false
      }
    }
    const timer = window.setInterval(analyseFrame, 500)
    const initialTimer = window.setTimeout(analyseFrame, 150)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearTimeout(initialTimer)
      setLocalDetections([])
    }
  }, [localWebcam, isActive, cameraId])

  // Retry on error
  const handleError = () => {
    setHasError(true)
    setTimeout(() => {
      setHasError(false)
      setKey(k => k + 1)
    }, 8000)
  }

  // Fullscreen change listener
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const streamSrc =
    streamUrl && isActive && !hasError && !embedMode && !localWebcam
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
      ) : localWebcam && isActive ? (
        <>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', visibility: hasError ? 'hidden' : 'visible' }}
        />
        {hasError && <Typography color="grey.400" variant="caption" sx={{ position: 'absolute', px: 2 }}>Webcamga ulanilmadi. 8 soniyada qayta uriniladi.</Typography>}
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
          {!isActive ? 'Kamera nofaol' : streamUrl
            ? hasError
              ? '⚠ Offline · 8s da qayta urinadi...'
              : 'Yuklanmoqda...'
            : 'Kamera nofaol'}
        </Typography>
      )}
      {localWebcam && !hasError && detectionSize.width > 0 && detectionSize.height > 0 && localDetections.map((detection, index) => {
        const [x1, y1, x2, y2] = detection.bbox
        const left = `${(x1 / detectionSize.width) * 100}%`
        const top = `${(y1 / detectionSize.height) * 100}%`
        const width = `${((x2 - x1) / detectionSize.width) * 100}%`
        const height = `${((y2 - y1) / detectionSize.height) * 100}%`
        return <Box key={`${detection.label}-${index}`} sx={{ position: 'absolute', left, top, width, height, border: '2px solid #ffdc00', boxSizing: 'border-box', pointerEvents: 'none' }}>
          <Box sx={{ position: 'absolute', top: -26, left: -2, whiteSpace: 'nowrap', bgcolor: 'rgba(0,0,0,.8)', color: '#fff', px: .65, py: .25, borderRadius: .5, fontSize: 12, fontWeight: 800 }}>
            {detection.label}
          </Box>
        </Box>
      })}

      {/* LIVE badge */}
      {(streamSrc || (localWebcam && isActive && !hasError)) && (
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
