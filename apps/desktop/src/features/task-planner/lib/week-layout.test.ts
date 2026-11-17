import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  getWeekDays,
  layoutDayBlocks,
  rangeAtOffset,
  resizeToOffset,
} from './week-layout.ts'

describe('getWeekDays', () => {
  it('lists seven days across a month boundary', () => {
    expect(getWeekDays('2026-11-30')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ])
  })
})

describe('rangeAtOffset', () => {
  it('snaps a drop to the quarter hour', () => {
    expect(rangeAtOffset(48 * 9 + 5, 30)).toEqual({ start: 540, end: 570 })
    expect(rangeAtOffset(48 * 9 + 10, 30)).toEqual({ start: 555, end: 585 })
  })

  it('keeps the block inside the day', () => {
    expect(rangeAtOffset(-200, 60)).toEqual({ start: 0, end: 60 })
    expect(rangeAtOffset(48 * 30, 60)).toEqual({ start: 1380, end: 1440 })
  })
})

describe('resizeToOffset', () => {
  it('moves the end and keeps at least one step', () => {
    expect(resizeToOffset({ start: 540, end: 570 }, 48 * 11)).toEqual({ start: 540, end: 660 })
    expect(resizeToOffset({ start: 540, end: 570 }, 0)).toEqual({ start: 540, end: 555 })
    expect(resizeToOffset({ start: 540, end: 570 }, 48 * 40)).toEqual({ start: 540, end: 1440 })
  })
})

describe('layoutDayBlocks', () => {
  it('gives a lone block the full width', () => {
    const lanes = layoutDayBlocks([{ id: 'a', start: 60, end: 120 }])
    expect(lanes.get('a')).toEqual({ column: 0, columns: 1 })
  })

  it('places overlapping blocks side by side and reuses freed lanes', () => {
    const lanes = layoutDayBlocks([
      { id: 'a', start: 60, end: 180 },
      { id: 'b', start: 90, end: 120 },
      { id: 'c', start: 120, end: 150 },
      { id: 'd', start: 300, end: 360 },
    ])
    expect(lanes.get('a')).toEqual({ column: 0, columns: 2 })
    expect(lanes.get('b')).toEqual({ column: 1, columns: 2 })
    expect(lanes.get('c')).toEqual({ column: 1, columns: 2 })
    expect(lanes.get('d')).toEqual({ column: 0, columns: 1 })
  })
})

describe('formatMinutes', () => {
  it('formats both clocks', () => {
    expect(formatMinutes(870, '24h')).toBe('14:30')
    expect(formatMinutes(870, '12h')).toBe('2:30pm')
    expect(formatMinutes(0, '12h')).toBe('12am')
    expect(formatMinutes(720, '12h')).toBe('12pm')
  })
})
