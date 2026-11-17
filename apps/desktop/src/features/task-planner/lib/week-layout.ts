import { addDaysToIsoDate } from '@reflect/utils'
import { MINUTES_PER_DAY, type TimeRange } from './task-schedule.ts'

/**
 * Pixels per hour of the time grid.
 */
export const HOUR_HEIGHT = 48
/**
 * The step a dragged or resized block snaps to.
 */
export const SNAP_MINUTES = 15

/**
 * The seven ISO dates of the week starting at `weekStart`.
 */
export function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToIsoDate(weekStart, index))
}

/**
 * A minute of the day as a vertical offset in the grid.
 */
export function minutesToOffset(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT
}

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/**
 * The block a drop at `offset` pixels from the top of a day column creates:
 * snapped, `duration` long, and kept inside the day.
 */
export function rangeAtOffset(offset: number, duration: number): TimeRange {
  const length = Math.min(Math.max(duration, SNAP_MINUTES), MINUTES_PER_DAY)
  const start = Math.min(Math.max(snap((offset / HOUR_HEIGHT) * 60), 0), MINUTES_PER_DAY - length)
  return { start, end: start + length }
}

/**
 * The block `range` becomes when its bottom edge is dragged to `offset`
 * pixels: the end snaps, and never comes closer than one step to the start.
 */
export function resizeToOffset(range: TimeRange, offset: number): TimeRange {
  const end = Math.min(
    Math.max(snap((offset / HOUR_HEIGHT) * 60), range.start + SNAP_MINUTES),
    MINUTES_PER_DAY,
  )
  return { start: range.start, end }
}

/**
 * A timed item to place in a day column.
 */
export interface DayBlock extends TimeRange {
  readonly id: string
}

/**
 * Where an item sits horizontally: `column` of `columns` equal lanes.
 */
export interface BlockLane {
  readonly column: number
  readonly columns: number
}

/**
 * Lay overlapping blocks side by side. Blocks that touch in time form a
 * cluster; each takes the first free lane, and every block in the cluster is
 * as wide as the cluster's busiest moment needs.
 */
export function layoutDayBlocks(blocks: readonly DayBlock[]): Map<string, BlockLane> {
  const sorted = [...blocks].sort((left, right) => {
    return left.start - right.start || right.end - left.end || (left.id < right.id ? -1 : 1)
  })
  const lanes = new Map<string, BlockLane>()
  let cluster: { id: string; column: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1

  const closeCluster = (): void => {
    for (const placed of cluster) {
      lanes.set(placed.id, { column: placed.column, columns: laneEnds.length })
    }
    cluster = []
    laneEnds = []
  }

  for (const block of sorted) {
    if (block.start >= clusterEnd) {
      closeCluster()
    }
    const free = laneEnds.findIndex((end) => end <= block.start)
    const column = free === -1 ? laneEnds.length : free
    laneEnds[column] = block.end
    cluster.push({ id: block.id, column })
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  closeCluster()
  return lanes
}

/**
 * A minute of the day for display: `14:30` on the 24-hour clock, `2:30pm` or
 * `2pm` on the 12-hour one.
 */
export function formatMinutes(minutes: number, timeFormat: '12h' | '24h'): string {
  const hours = Math.floor(minutes / 60) % 24
  const rest = minutes % 60
  const padded = String(rest).padStart(2, '0')
  if (timeFormat === '24h') {
    return `${String(hours).padStart(2, '0')}:${padded}`
  }
  const hour = hours % 12 === 0 ? 12 : hours % 12
  const suffix = hours < 12 ? 'am' : 'pm'
  return rest === 0 ? `${hour}${suffix}` : `${hour}:${padded}${suffix}`
}

/**
 * The part of an epoch-millisecond interval that falls on the local day
 * `date`, as minutes of that day; null when they do not overlap.
 */
export function rangeOnDay(startsAt: number, endsAt: number, date: string): TimeRange | null {
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const dayEnd = new Date(`${addDaysToIsoDate(date, 1)}T00:00:00`).getTime()
  if (endsAt <= dayStart || startsAt >= dayEnd) {
    return null
  }
  const start = Math.max(0, Math.round((startsAt - dayStart) / 60_000))
  const end = Math.min(MINUTES_PER_DAY, Math.round((endsAt - dayStart) / 60_000))
  return { start, end: Math.max(end, start + SNAP_MINUTES) }
}
