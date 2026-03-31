import React, { useEffect, useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'

interface StreamProps {
  streamUrl?: string | null
  isActive: boolean
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive }) => {
  const [hasError, setHasError] = useState(false)
  const [tick, setTick] = useState(0)

  const streamEndpoint = useMemo(() => {
    if (!streamUrl) {
      return null
    }

    return `${API_BASE}/cameras/stream/snapshot/?url=${encodeURIComponent(streamUrl)}&t=${tick}`
  }, [streamUrl, tick])

  useEffect(() => {
    setHasError(false)
    setTick(0)
  }, [streamUrl])

  useEffect(() => {
    if (!streamUrl) {
      return undefined
    }

    const interval = window.setInterval(() => setTick((prev) => prev + 1), 1000)
    return () => window.clearInterval(interval)
  }, [streamUrl])

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
      {streamEndpoint && !hasError ? (
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
          {streamUrl ? 'Ulanishda xatolik, qayta urinmoqda...' : 'Kamera nofaol'}
        </Typography>
      )}

      {streamEndpoint && (
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