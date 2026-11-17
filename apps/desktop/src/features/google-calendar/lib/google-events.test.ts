import { describe, expect, it } from 'vitest'
import {
  eventTimesBody,
  mergeCalendarEvents,
  timeOnDay,
  toGoogleCalendarEvent,
  visibleCalendars,
  type GoogleCalendar,
} from './google-events.ts'

const work: GoogleCalendar = {
  id: 'work@example.com',
  title: 'Work',
  color: '#0b8043',
  writable: true,
}

describe('visibleCalendars', () => {
  it('keeps the calendars ticked in Google Calendar', () => {
    const calendars = visibleCalendars([
      {
        id: 'a',
        summary: 'Mine',
        selected: true,
        backgroundColor: '#111111',
        primary: true,
        accessRole: 'owner',
      },
      { id: 'b', summary: 'Team', summaryOverride: 'My team', selected: true },
      { id: 'c', summary: 'Holidays', selected: false },
      { id: 'd', summary: 'Hidden', selected: true, hidden: true },
    ])
    expect(calendars).toEqual([
      { id: 'a', title: 'Mine', color: '#111111', writable: true },
      { id: 'b', title: 'My team', color: null, writable: false },
    ])
  })

  it('falls back to the primary calendar when none is ticked', () => {
    expect(
      visibleCalendars([
        { id: 'a', summary: 'Mine', primary: true },
        { id: 'b', summary: 'Team' },
      ]),
    ).toEqual([{ id: 'a', title: 'Mine', color: null, writable: false }])
  })
})

describe('toGoogleCalendarEvent', () => {
  it('maps a timed event with its calendar colour', () => {
    const event = toGoogleCalendarEvent(
      {
        id: 'e1',
        iCalUID: 'uid-1',
        summary: ' Standup ',
        start: { dateTime: '2026-11-16T09:00:00+02:00' },
        end: { dateTime: '2026-11-16T09:30:00+02:00' },
      },
      work,
    )
    const startsAt = Date.parse('2026-11-16T07:00:00Z')
    expect(event).toEqual({
      id: `uid-1:${startsAt}`,
      calendarId: 'work@example.com',
      eventId: 'e1',
      title: 'Standup',
      startsAt,
      endsAt: Date.parse('2026-11-16T07:30:00Z'),
      allDay: false,
      color: '#0b8043',
      editable: true,
    })
  })

  it('spans local midnights for an all-day event and names an untitled one', () => {
    const event = toGoogleCalendarEvent(
      { id: 'e2', start: { date: '2026-11-16' }, end: { date: '2026-11-18' } },
      work,
    )
    expect(event).toMatchObject({
      title: '(No title)',
      allDay: true,
      startsAt: new Date('2026-11-16T00:00:00').getTime(),
      endsAt: new Date('2026-11-18T00:00:00').getTime(),
    })
  })

  it('drops cancelled, declined and working-location events', () => {
    const times = {
      start: { dateTime: '2026-11-16T09:00:00Z' },
      end: { dateTime: '2026-11-16T10:00:00Z' },
    }
    expect(toGoogleCalendarEvent({ id: 'a', status: 'cancelled', ...times }, work)).toBeNull()
    expect(
      toGoogleCalendarEvent({ id: 'b', eventType: 'workingLocation', ...times }, work),
    ).toBeNull()
    expect(
      toGoogleCalendarEvent(
        { id: 'c', attendees: [{ self: true, responseStatus: 'declined' }], ...times },
        work,
      ),
    ).toBeNull()
    expect(
      toGoogleCalendarEvent(
        { id: 'd', attendees: [{ responseStatus: 'declined' }], ...times },
        work,
      ),
    ).not.toBeNull()
    expect(toGoogleCalendarEvent({ id: 'e' }, work)).toBeNull()
  })
})

describe('editable', () => {
  const times = {
    start: { dateTime: '2026-11-16T09:00:00Z' },
    end: { dateTime: '2026-11-16T10:00:00Z' },
  }
  const editable = (event: object, calendar: GoogleCalendar = work): boolean | undefined => {
    return toGoogleCalendarEvent({ id: 'e', ...times, ...event }, calendar)?.editable
  }

  it('allows the account’s own events on a calendar it can write to', () => {
    expect(editable({})).toBe(true)
    expect(editable({ organizer: { self: true }, attendees: [{ self: true }] })).toBe(true)
  })

  it('refuses read-only calendars, other people’s invitations and generated events', () => {
    expect(editable({}, { ...work, writable: false })).toBe(false)
    expect(editable({ attendees: [{ self: true }] })).toBe(false)
    expect(editable({ attendees: [{ self: true }], guestsCanModify: true })).toBe(true)
    expect(editable({ eventType: 'birthday' })).toBe(false)
  })
})

describe('eventTimesBody', () => {
  it('writes a local slot as absolute times', () => {
    const start = timeOnDay('2026-11-16', 9 * 60 + 30)
    expect(new Date(start).getHours()).toBe(9)
    expect(new Date(start).getMinutes()).toBe(30)
    expect(eventTimesBody({ start, end: start + 3_600_000 })).toEqual({
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(start + 3_600_000).toISOString() },
    })
  })
})

describe('mergeCalendarEvents', () => {
  it('shows an event on two calendars once, in start order', () => {
    const event = (id: string, startsAt: number, color: string) => ({
      id,
      calendarId: 'c',
      eventId: id,
      editable: true,
      title: id,
      startsAt,
      endsAt: startsAt + 1,
      allDay: false,
      color,
    })
    const merged = mergeCalendarEvents([
      [event('late', 20, 'red'), event('shared', 10, 'red')],
      [event('shared', 10, 'blue'), event('early', 5, 'blue')],
    ])
    expect(merged.map((item) => `${item.id}:${item.color}`)).toEqual([
      'early:blue',
      'shared:red',
      'late:red',
    ])
  })
})
