import React, { useEffect, useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'

interface StreamProps {
  streamUrl?: string | null
  isActive: boolean
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive }) => {
  const [hasError, setHasError] = useState(false)

  const streamEndpoint = useMemo(() => {
    if (!isActive || !streamUrl) {
      return null
    }
    return `${API_BASE}/cameras/stream/?url=${encodeURIComponent(streamUrl)}`
  }, [isActive, streamUrl])

  useEffect(() => {
    setHasError(false)
  }, [streamEndpoint])

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
          onError={() => setHasError(true)}
        />
      ) : (
        <Typography color="white">
          {isActive ? 'Signal mavjud emas' : 'Kamera nofaol'}
        </Typography>
      )}

      {isActive && (
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