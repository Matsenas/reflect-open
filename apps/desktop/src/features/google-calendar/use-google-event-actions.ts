import { useMemo } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { errorMessage } from '@reflect/core'
import { toast } from '@/components/ui/toast.tsx'
import type { GoogleCalendarService } from './google-calendar-service.ts'
import type { GoogleCalendarEvent, TimeSpan } from './lib/google-events.ts'
import {
  GOOGLE_EVENTS_QUERY_KEY,
  useGoogleCalendarService,
  useGoogleCalendarState,
} from './use-google-calendar.ts'

export interface GoogleEventActions {
  /**
   * Whether the connected sign-in may create and move events.
   */
  readonly canWrite: boolean
  /**
   * Move a timed event to `span`. The grid shows it there at once; a refusal
   * from Google puts it back and says why.
   */
  readonly move: (event: GoogleCalendarEvent, span: TimeSpan) => void
  /**
   * Create a timed event on the primary calendar.
   */
  readonly create: (title: string, span: TimeSpan) => void
}

type CachedEvents = readonly GoogleCalendarEvent[] | undefined

function editCachedEvents(
  queryClient: QueryClient,
  edit: (events: readonly GoogleCalendarEvent[]) => readonly GoogleCalendarEvent[],
): void {
  queryClient.setQueriesData<CachedEvents>({ queryKey: GOOGLE_EVENTS_QUERY_KEY }, (events) => {
    return events === undefined ? events : edit(events)
  })
}

async function runWrite(
  queryClient: QueryClient,
  failure: string,
  write: () => Promise<unknown>,
): Promise<void> {
  try {
    await write()
  } catch (error: unknown) {
    toast.add({ title: failure, description: errorMessage(error), type: 'error' })
  }
  // Google's answer replaces the optimistic copy, or removes it on failure.
  await queryClient.invalidateQueries({ queryKey: GOOGLE_EVENTS_QUERY_KEY })
}

function createActions(
  service: GoogleCalendarService,
  queryClient: QueryClient,
): Pick<GoogleEventActions, 'move' | 'create'> {
  return {
    move: (event, span) => {
      editCachedEvents(queryClient, (events) => {
        return events.map((cached) => {
          return cached.id === event.id
            ? { ...cached, startsAt: span.start, endsAt: span.end }
            : cached
        })
      })
      void runWrite(queryClient, 'Couldn’t move the event', () => service.moveEvent(event, span))
    },
    create: (title, span) => {
      const placeholder: GoogleCalendarEvent = {
        id: `pending:${title}:${span.start}`,
        calendarId: 'primary',
        eventId: '',
        title,
        startsAt: span.start,
        endsAt: span.end,
        allDay: false,
        color: null,
        // Not movable until Google has given it an id.
        editable: false,
      }
      editCachedEvents(queryClient, (events) => [...events, placeholder])
      void runWrite(queryClient, 'Couldn’t create the event', () => {
        return service.createEvent({ title, span })
      })
    },
  }
}

/**
 * Create and move events on the connected Google Calendar.
 */
export function useGoogleEventActions(): GoogleEventActions {
  const service = useGoogleCalendarService()
  const queryClient = useQueryClient()
  const { status, canWrite } = useGoogleCalendarState()
  const actions = useMemo(() => createActions(service, queryClient), [queryClient, service])
  return useMemo(
    () => ({ canWrite: status === 'connected' && canWrite, ...actions }),
    [actions, canWrite, status],
  )
}
