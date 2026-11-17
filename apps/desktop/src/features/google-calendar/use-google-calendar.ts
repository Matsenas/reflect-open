import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  createBrowserHttpService,
  dayRange,
  type CoreServices,
  type IpcBridgeService,
} from '@reflect/core'
import { useAppServices, useCoreServices } from '@/services/services-provider.tsx'
import { createTauriHttpService } from '@/services/tauri-http.ts'
import { useServiceState } from '@/services/use-service-state.ts'
import {
  createGoogleCalendarService,
  type GoogleCalendarService,
  type GoogleCalendarState,
  type KeychainPort,
} from './google-calendar-service.ts'
import type { GoogleCalendarEvent } from './lib/google-events.ts'

const voidSchema = z.null()

function createIpcKeychain(ipc: IpcBridgeService): KeychainPort {
  return {
    get: (name) => ipc.call('secret_get', { name }, z.string().nullable()),
    set: async (name, value) => {
      await ipc.call('secret_set', { name, value }, voidSchema)
    },
    delete: async (name) => {
      await ipc.call('secret_delete', { name }, voidSchema)
    },
  }
}

// One service per webview. It is fork-only, so it is built here from the
// core services instead of being added to the upstream-owned service roots.
const services = new WeakMap<CoreServices, GoogleCalendarService>()

/**
 * This webview's {@link GoogleCalendarService}.
 */
export function useGoogleCalendarService(): GoogleCalendarService {
  const core = useCoreServices()
  const { opener } = useAppServices()
  let service = services.get(core)
  if (service === undefined) {
    service = createGoogleCalendarService({
      ipc: core.ipc,
      // The Tauri client sends from Rust, so webview CORS does not apply.
      http: core.platform.isNativeShell ? createTauriHttpService() : createBrowserHttpService(),
      clock: core.clock,
      logger: core.logger,
      keychain: createIpcKeychain(core.ipc),
      openUrl: (url) => opener.openUrl(url),
    })
    services.set(core, service)
  }
  return service
}

/**
 * The Google Calendar connection state, read from the keychain on first use.
 */
export function useGoogleCalendarState(): GoogleCalendarState {
  const service = useGoogleCalendarService()
  useEffect(() => {
    void service.load()
  }, [service])
  return useServiceState(service, service.getState)
}

const NO_EVENTS: readonly GoogleCalendarEvent[] = []
const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export interface GoogleEventsResult {
  readonly events: readonly GoogleCalendarEvent[]
  /** Why the events could not be loaded; null when they were, or none were asked for. */
  readonly error: string | null
}

/**
 * The connected account's events for the consecutive ISO `days`, fetched
 * live. Empty while disconnected. Google has no push channel a desktop app
 * can use, so the list refreshes on window focus and every few minutes.
 */
export function useGoogleEvents(days: readonly string[]): GoogleEventsResult {
  const service = useGoogleCalendarService()
  const { status, email } = useGoogleCalendarState()
  const first = days[0]
  const last = days.at(-1)
  const enabled = status === 'connected' && first !== undefined && last !== undefined
  const query = useQuery({
    queryKey: ['google-calendar', 'events', email, first, last],
    queryFn: () => {
      if (first === undefined || last === undefined) {
        return []
      }
      return service.listEvents({ start: dayRange(first).start, end: dayRange(last).end })
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  // Gate on `enabled`, not just the cache: the query keeps its last payload
  // after a disconnect, and those meetings must not linger on the grid.
  return useMemo(
    () => ({
      events: enabled ? (query.data ?? NO_EVENTS) : NO_EVENTS,
      error: enabled && query.error !== null ? query.error.message : null,
    }),
    [enabled, query.data, query.error],
  )
}
