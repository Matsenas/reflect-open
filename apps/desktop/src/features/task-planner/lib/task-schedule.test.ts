import { describe, expect, it } from 'vitest'
import { formatClock, getTaskSchedule, setTaskSchedule } from './task-schedule.ts'

describe('getTaskSchedule', () => {
  it('reads nothing from an undated task', () => {
    expect(getTaskSchedule('Call the dentist at 14:00')).toBeNull()
  })

  it('reads a date-only schedule', () => {
    expect(getTaskSchedule('Call the dentist [[2026-11-17]]')).toEqual({
      date: '2026-11-17',
      time: null,
    })
  })

  it('reads a time block after the date link', () => {
    expect(getTaskSchedule('Call [[2026-11-17]] 14:00-15:30 #health')).toEqual({
      date: '2026-11-17',
      time: { start: 840, end: 930 },
    })
  })

  it('accepts an en dash and a missing end time', () => {
    expect(getTaskSchedule('[[2026-11-17]] 9:15 – 10:00')?.time).toEqual({ start: 555, end: 600 })
    expect(getTaskSchedule('[[2026-11-17]] 09:15')?.time).toEqual({ start: 555, end: 585 })
  })

  it('ignores an impossible time and a time that is not next to the link', () => {
    expect(getTaskSchedule('[[2026-11-17]] 25:00')?.time).toBeNull()
    expect(getTaskSchedule('[[2026-11-17]] at 14:00')?.time).toBeNull()
  })

  it('uses the first date link, like the Tasks view', () => {
    expect(getTaskSchedule('See [[Plan]] [[2026-11-17]] 08:00-09:00 [[2026-12-01]]')).toEqual({
      date: '2026-11-17',
      time: { start: 480, end: 540 },
    })
  })
})

describe('setTaskSchedule', () => {
  it('appends a date and time to an unscheduled task', () => {
    expect(
      setTaskSchedule('Call the dentist', { date: '2026-11-17', time: { start: 840, end: 870 } }),
    ).toBe('Call the dentist [[2026-11-17]] 14:00-14:30')
  })

  it('moves a timed task in place and keeps the surrounding text', () => {
    expect(
      setTaskSchedule('Call [[2026-11-17]] 14:00-15:30 #health', {
        date: '2026-11-19',
        time: { start: 600, end: 690 },
      }),
    ).toBe('Call [[2026-11-19]] 10:00-11:30 #health')
  })

  it('drops the time for an all-day schedule', () => {
    expect(
      setTaskSchedule('Call [[2026-11-17]] 14:00-15:30 #health', {
        date: '2026-11-18',
        time: null,
      }),
    ).toBe('Call [[2026-11-18]] #health')
  })

  it('removes the date and the time when unscheduling', () => {
    expect(setTaskSchedule('Call [[2026-11-17]] 14:00-15:30 #health', null)).toBe('Call #health')
    expect(setTaskSchedule('Call the dentist', null)).toBe('Call the dentist')
  })

  it('round-trips through getTaskSchedule', () => {
    const schedule = { date: '2026-11-17', time: { start: 1380, end: 1440 } }
    expect(getTaskSchedule(setTaskSchedule('Late shift', schedule))).toEqual(schedule)
  })
})

describe('formatClock', () => {
  it('pads hours and minutes', () => {
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(1440)).toBe('24:00')
  })
})
