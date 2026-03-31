import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'

export interface CoordinatesValue {
  lat: number | null
  lng: number | null
}

export interface GoogleMarker {
  id: number | string
  lat: number | null
  lng: number | null
  title: string
  description?: string
}

interface GoogleMapPickerProps {
  value?: CoordinatesValue
  onChange?: (coords: { lat: number; lng: number }) => void
  onAddressSelect?: (address: string) => void
  markers?: GoogleMarker[]
  height?: number
  readOnly?: boolean
}

const DEFAULT_CENTER = { lat: 40.735, lng: 72.24 }
const GEOJSON_PATH = '/asaka_border.geojson'

const hasValidCoords = (lat: number | null | undefined, lng: number | null | undefined) =>
  typeof lat === 'number' && !Number.isNaN(lat) && typeof lng === 'number' && !Number.isNaN(lng)

const selectedIcon = L.divIcon({
  className: 'leaflet-pin-selected',
  html: '<div style="width:18px;height:18px;background:#1976d2;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(25,118,210,.35);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const markerIcon = L.divIcon({
  className: 'leaflet-pin-marker',
  html: '<div style="width:16px;height:16px;background:#2e7d32;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(46,125,50,.35);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function MapViewport({
  center,
  bounds,
  zoom,
}: {
  center: [number, number]
  bounds: L.LatLngBounds | null
  zoom: number
}) {
  const map = useMap()

  useEffect(() => {
    if (bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] })
      return
    }

    map.setView(center, zoom)
  }, [bounds, center, map, zoom])

  return null
}

function ClickToSelect({
  readOnly,
  onChange,
  onAddressSelect,
}: Pick<GoogleMapPickerProps, 'readOnly' | 'onChange' | 'onAddressSelect'>) {
  useMapEvents({
    click(event) {
      if (readOnly) {
        return
      }

      const nextCoords = {
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      }

      onChange?.(nextCoords)
      onAddressSelect?.(`Asaka hududi: ${nextCoords.lat}, ${nextCoords.lng}`)
    },
  })

  return null
}

function GoogleMapPicker({
  value,
  onChange,
  onAddressSelect,
  markers = [],
  height = 320,
  readOnly = false,
}: GoogleMapPickerProps) {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadGeoJson = async () => {
      try {
        const response = await fetch(GEOJSON_PATH)

        if (!response.ok) {
          throw new Error('`asaka_border.geojson` yuklanmadi.')
        }

        const data = await response.json()

        if (active) {
          setGeoJsonData(data)
          setError(null)
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'GeoJSON xarita yuklanmadi.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadGeoJson()

    return () => {
      active = false
    }
  }, [])

  const normalizedMarkers = useMemo(
    () => markers.filter((item) => hasValidCoords(item.lat, item.lng)),
    [markers]
  )

  const selectedPoint = useMemo<[number, number] | null>(() => {
    if (!hasValidCoords(value?.lat, value?.lng)) {
      return null
    }

    return [Number(value?.lat), Number(value?.lng)]
  }, [value?.lat, value?.lng])

  const geoJsonBounds = useMemo(() => {
    if (!geoJsonData) {
      return null
    }

    try {
      const bounds = L.geoJSON(geoJsonData as any).getBounds()
      return bounds.isValid() ? bounds : null
    } catch {
      return null
    }
  }, [geoJsonData])

  const markersBounds = useMemo(() => {
    const points: [number, number][] = [
      ...normalizedMarkers.map((item) => [Number(item.lat), Number(item.lng)] as [number, number]),
      ...(selectedPoint ? [selectedPoint] : []),
    ]

    if (points.length < 2) {
      return null
    }

    return L.latLngBounds(points)
  }, [normalizedMarkers, selectedPoint])

  const center = useMemo<[number, number]>(() => {
    if (selectedPoint) {
      return selectedPoint
    }

    if (normalizedMarkers[0] && hasValidCoords(normalizedMarkers[0].lat, normalizedMarkers[0].lng)) {
      return [Number(normalizedMarkers[0].lat), Number(normalizedMarkers[0].lng)]
    }

    if (geoJsonBounds?.isValid()) {
      const nextCenter = geoJsonBounds.getCenter()
      return [nextCenter.lat, nextCenter.lng]
    }

    return [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]
  }, [geoJsonBounds, normalizedMarkers, selectedPoint])

  const activeBounds = selectedPoint ? null : markersBounds ?? geoJsonBounds

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <Chip label="`asaka_border.geojson` asosida" color="primary" variant="outlined" />
        {!readOnly && <Chip label="Xaritada bosib koordinata tanlang" variant="outlined" />}
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid #d7d7d7',
          minHeight: height,
        }}
      >
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 401,
              bgcolor: 'rgba(255,255,255,0.75)',
            }}
          >
            <CircularProgress />
          </Box>
        )}

        <MapContainer center={center} zoom={13} style={{ width: '100%', height }} scrollWheelZoom={!readOnly}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          <MapViewport center={center} bounds={activeBounds} zoom={selectedPoint ? 15 : 13} />
          <ClickToSelect readOnly={readOnly} onChange={onChange} onAddressSelect={onAddressSelect} />

          {geoJsonData && (
            <GeoJSON
              data={geoJsonData}
              style={() => ({
                color: '#1976d2',
                weight: 2,
                fillColor: '#90caf9',
                fillOpacity: 0.12,
              })}
            />
          )}

          {selectedPoint && (
            <Marker position={selectedPoint} icon={selectedIcon}>
              <Popup>
                {readOnly ? 'Tanlangan lokatsiya' : 'Tanlangan nuqta'}
                <br />
                {selectedPoint[0].toFixed(6)}, {selectedPoint[1].toFixed(6)}
              </Popup>
            </Marker>
          )}

          {normalizedMarkers.map((item) => (
            <Marker key={item.id} position={[Number(item.lat), Number(item.lng)]} icon={markerIcon}>
              <Popup>
                <strong>{item.title}</strong>
                {item.description ? (
                  <>
                    <br />
                    {item.description}
                  </>
                ) : null}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {readOnly
          ? 'Lokatsiyalar Asaka hududi chegarasi ustida ko‘rsatilmoqda.'
          : 'Google API kerak emas — xarita `asaka_border.geojson` va OpenStreetMap asosida ishlaydi.'}
      </Typography>
    </Box>
  )
}

export default GoogleMapPicker
