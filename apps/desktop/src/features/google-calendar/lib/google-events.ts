import { z } from 'zod'

/**
 * The Google Calendar API shapes the planner reads, and the policy for which
 * events are worth showing. Events are fetched live and never stored.
 */

export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        backgroundColor: z.string().optional(),
        selected: z.boolean().optional(),
        hidden: z.boolean().optional(),
        primary: z.boolean().optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
})

export type CalendarListEntry = z.infer<typeof calendarListSchema>['items'][number]

const eventTimeSchema = z.object({
  /** RFC 3339, for a timed event. */
  dateTime: z.string().optional(),
  /** `YYYY-MM-DD`, for an all-day event. */
  date: z.string().optional(),
})

const eventSchema = z.object({
  id: z.string(),
  iCalUID: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  eventType: z.string().optional(),
  start: eventTimeSchema.optional(),
  end: eventTimeSchema.optional(),
  attendees: z
    .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
    .optional(),
})

export const eventListSchema = z.object({
  items: z.array(eventSchema).default([]),
  nextPageToken: z.string().optional(),
})

export type GoogleApiEvent = z.infer<typeof eventSchema>

/**
 * The `fields` filter for an events request: only what {@link eventSchema}
 * reads, so descriptions, locations and attendee lists never leave Google.
 */
export const EVENT_FIELDS =
  'nextPageToken,items(id,iCalUID,status,summary,eventType,start,end,attendees(self,responseStatus))'

/**
 * A span of time as epoch milliseconds, `start` inclusive.
 */
export interface TimeSpan {
  readonly start: number
  readonly end: number
}

/**
 * A calendar the planner shows events from.
 */
export interface GoogleCalendar {
  readonly id: string
  readonly title: string
  /** `#rrggbb`, when Google reports one. */
  readonly color: string | null
}

/**
 * One Google Calendar event, ready for the week grid.
 */
export interface GoogleCalendarEvent {
  /** Unique per occurrence across calendars. */
  readonly id: string
  readonly title: string
  /** Epoch milliseconds; an all-day event spans local midnights. */
  readonly startsAt: number
  readonly endsAt: number
  readonly allDay: boolean
  /** The owning calendar's colour. */
  readonly color: string | null
}

/**
 * The calendars to show: the ones ticked in Google Calendar's own sidebar, so
 * the planner matches what the user already sees there. An account with none
 * ticked falls back to its primary calendar.
 */
export function visibleCalendars(entries: readonly CalendarListEntry[]): GoogleCalendar[] {
  const shown = entries.filter((entry) => entry.selected === true && entry.hidden !== true)
  const chosen = shown.length > 0 ? shown : entries.filter((entry) => entry.primary === true)
  return chosen.map((entry) => ({
    id: entry.id,
    title: entry.summaryOverride ?? entry.summary ?? entry.id,
    color: entry.backgroundColor ?? null,
  }))
}

function localMidnight(date: string): number | null {
  const time = new Date(`${date}T00:00:00`).getTime()
  return Number.isNaN(time) ? null : time
}

function toInterval(
  event: GoogleApiEvent,
): { startsAt: number; endsAt: number; allDay: boolean } | null {
  const { start, end } = event
  if (start?.date !== undefined && end?.date !== undefined) {
    const startsAt = localMidnight(start.date)
    const endsAt = localMidnight(end.date)
    return startsAt === null || endsAt === null ? null : { startsAt, endsAt, allDay: true }
  }
  if (start?.dateTime !== undefined && end?.dateTime !== undefined) {
    const startsAt = Date.parse(start.dateTime)
    const endsAt = Date.parse(end.dateTime)
    return Number.isNaN(startsAt) || Number.isNaN(endsAt)
      ? null
      : { startsAt, endsAt, allDay: false }
  }
  return null
}

function isDeclined(event: GoogleApiEvent): boolean {
  return (event.attendees ?? []).some((attendee) => {
    return attendee.self === true && attendee.responseStatus === 'declined'
  })
}

/**
 * One API event as a planner event, or null when it is not worth showing:
 * cancelled, declined by the user, a working-location marker, or missing its
 * times.
 */
export function toGoogleCalendarEvent(
  event: GoogleApiEvent,
  calendar: GoogleCalendar,
): GoogleCalendarEvent | null {
  if (event.status === 'cancelled' || event.eventType === 'workingLocation' || isDeclined(event)) {
    return null
  }
  const interval = toInterval(event)
  if (interval === null) {
    return null
  }
  const title = event.summary?.trim() ?? ''
  return {
    // An invitation shows up on every calendar it was sent to; the iCal UID
    // is the same on each, so it collapses them in `mergeCalendarEvents`.
    id: `${event.iCalUID ?? `${calendar.id}:${event.id}`}:${interval.startsAt}`,
    title: title === '' ? '(No title)' : title,
    color: calendar.color,
    ...interval,
  }
}

/**
 * Every calendar's events as one list in start order, an event that sits on
 * several calendars kept once (the first calendar's copy wins).
 */
export function mergeCalendarEvents(
  perCalendar: readonly (readonly GoogleCalendarEvent[])[],
): GoogleCalendarEvent[] {
  const byId = new Map<string, GoogleCalendarEvent>()
  for (const events of perCalendar) {
    for (const event of events) {
      if (!byId.has(event.id)) {
        byId.set(event.id, event)
      }
    }
  }
  return [...byId.values()].sort((left, right) => {
    return left.startsAt - right.startsAt || left.title.localeCompare(right.title)
  })
}
