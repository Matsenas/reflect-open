import { describe, expect, it } from 'vitest'
import {
  mergeCalendarEvents,
  toGoogleCalendarEvent,
  visibleCalendars,
  type GoogleCalendar,
} from './google-events.ts'

const work: GoogleCalendar = { id: 'work@example.com', title: 'Work', color: '#0b8043' }

describe('visibleCalendars', () => {
  it('keeps the calendars ticked in Google Calendar', () => {
    const calendars = visibleCalendars([
      { id: 'a', summary: 'Mine', selected: true, backgroundColor: '#111111', primary: true },
      { id: 'b', summary: 'Team', summaryOverride: 'My team', selected: true },
      { id: 'c', summary: 'Holidays', selected: false },
      { id: 'd', summary: 'Hidden', selected: true, hidden: true },
    ])
    expect(calendars).toEqual([
      { id: 'a', title: 'Mine', color: '#111111' },
      { id: 'b', title: 'My team', color: null },
    ])
  })

  it('falls back to the primary calendar when none is ticked', () => {
    expect(
      visibleCalendars([
        { id: 'a', summary: 'Mine', primary: true },
        { id: 'b', summary: 'Team' },
      ]),
    ).toEqual([{ id: 'a', title: 'Mine', color: null }])
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
      title: 'Standup',
      startsAt,
      endsAt: Date.parse('2026-11-16T07:30:00Z'),
      allDay: false,
      color: '#0b8043',
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

describe('mergeCalendarEvents', () => {
  it('shows an event on two calendars once, in start order', () => {
    const event = (id: string, startsAt: number, color: string) => ({
      id,
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
