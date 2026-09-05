// Reserve a device before awaiting getUserMedia. Concurrent camera cards must
// share even the pending request, and release only their own reservation.
export function createSharedWebcamPool(open: (deviceId: string) => Promise<MediaStream>) {
  const devices = new Map<string, { pending: Promise<MediaStream>; users: number }>()

  return {
    async acquire(deviceId: string) {
      let entry = devices.get(deviceId)
      if (!entry) {
        entry = { pending: Promise.resolve().then(() => open(deviceId)), users: 0 }
        devices.set(deviceId, entry)
      }
      const reservation = entry
      reservation.users += 1
      let stream: MediaStream
      try {
        stream = await reservation.pending
      } catch (error) {
        if (devices.get(deviceId) === reservation) devices.delete(deviceId)
        throw error
      }
      let released = false
      return {
        stream,
        release() {
          if (released) return
          released = true
          reservation.users -= 1
          if (reservation.users === 0) {
            stream.getTracks().forEach(track => track.stop())
            if (devices.get(deviceId) === reservation) devices.delete(deviceId)
          }
        },
      }
    },
  }
}
