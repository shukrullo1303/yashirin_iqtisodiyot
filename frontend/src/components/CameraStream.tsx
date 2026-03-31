import React from 'react';
import { Box, Typography } from '@mui/material';

interface StreamProps {
  streamUrl: string;
  isActive: boolean;
}

const CameraStream: React.FC<StreamProps> = ({ streamUrl, isActive }) => {
  // Backend-dagi oqimga ulanish URL manzili
  // Masalan: http://localhost:8000/api/v1/cameras/stream/1/
  const streamEndpoint = isActive 
    ? `${process.env.REACT_APP_API_URL || ''}/cameras/stream_video?url=${encodeURIComponent(streamUrl)}`
    : null;

  return (
    <Box
      sx={{
        width: '100%',
        height: 200,
        bgcolor: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {isActive && streamEndpoint ? (
        <img
          src={streamEndpoint}
          alt="Live Stream"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x225?text=Signal+Yoq';
          }}
        />
      ) : (
        <Typography color="white">Kamera ochiq emas</Typography>
      )}
      <Box sx={{ position: 'absolute', top: 10, left: 10, bgcolor: 'rgba(255,0,0,0.7)', px: 1, borderRadius: 1 }}>
        <Typography variant="caption" color="white" sx={{ fontWeight: 'bold' }}>LIVE</Typography>
      </Box>
    </Box>
  );
};

export default CameraStream;