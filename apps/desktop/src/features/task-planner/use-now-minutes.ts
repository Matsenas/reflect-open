import { useEffect, useState } from 'react'
import { useCoreServices } from '@/services/services-provider.tsx'

function minutesOfDay(epochMs: number): number {
  const date = new Date(epochMs)
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * The current minute of the local day, refreshed twice a minute: what the
 * calendar's "now" line follows.
 */
export function useNowMinutes(): number {
  const { clock } = useCoreServices()
  const [minutes, setMinutes] = useState(() => minutesOfDay(clock.now()))
  useEffect(() => {
    const handle = clock.setInterval(() => {
      setMinutes(minutesOfDay(clock.now()))
    }, 30_000)
    return () => {
      clock.clearInterval(handle)
    }
  }, [clock])
  return minutes
}
