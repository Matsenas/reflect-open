import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  getTaskDuration,
  getTaskRepeat,
  nextOccurrence,
  setTaskDuration,
  setTaskRepeat,
} from './task-meta.ts'

describe('duration token', () => {
  it('reads minutes and hours', () => {
    expect(getTaskDuration('Gym (45m)')).toBe(45)
    expect(getTaskDuration('Deep work (1h30m) #work')).toBe(90)
    expect(getTaskDuration('Call (2h)')).toBe(120)
  })

  it('ignores ordinary parentheses', () => {
    expect(getTaskDuration('Call mum (again)')).toBeNull()
    expect(getTaskDuration('Empty ()')).toBeNull()
    expect(getTaskDuration('Run 30m')).toBeNull()
  })

  it('sets, replaces and removes the token', () => {
    expect(setTaskDuration('Gym', 45)).toBe('Gym (45m)')
    expect(setTaskDuration('Gym (45m) #health', 60)).toBe('Gym (1h) #health')
    expect(setTaskDuration('Gym (45m) #health', null)).toBe('Gym #health')
  })

  it('formats durations', () => {
    expect(formatDuration(30)).toBe('30m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(95)).toBe('1h35m')
  })
})

describe('repeat token', () => {
  it('reads and writes the rule', () => {
    expect(getTaskRepeat('Gym (weekly)')).toBe('weekly')
    expect(getTaskRepeat('Gym (sometimes)')).toBeNull()
    expect(setTaskRepeat('Gym (45m)', 'daily')).toBe('Gym (45m) (daily)')
    expect(setTaskRepeat('Gym (daily) #health', 'weekly')).toBe('Gym (weekly) #health')
    expect(setTaskRepeat('Gym (daily) #health', null)).toBe('Gym #health')
  })
})

describe('nextOccurrence', () => {
  it('advances by the rule', () => {
    expect(nextOccurrence('2026-11-17', 'daily')).toBe('2026-11-18')
    expect(nextOccurrence('2026-11-17', 'weekly')).toBe('2026-11-24')
    expect(nextOccurrence('2026-11-17', 'monthly')).toBe('2026-12-17')
  })

  it('skips the weekend for weekdays', () => {
    expect(nextOccurrence('2026-11-19', 'weekdays')).toBe('2026-11-20')
    expect(nextOccurrence('2026-11-20', 'weekdays')).toBe('2026-11-23')
    expect(nextOccurrence('2026-11-21', 'weekdays')).toBe('2026-11-23')
  })
})
