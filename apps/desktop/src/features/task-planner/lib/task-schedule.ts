import { normalizeWikiTarget, withDraftDueDate } from '@reflect/core'

/**
 * A planner time block, in minutes from local midnight. `end` is exclusive
 * and may be `1440` (midnight at the end of the day).
 */
export interface TimeRange {
  readonly start: number
  readonly end: number
}

/**
 * Where a task sits on the calendar: its due date (Reflect's own
 * `[[YYYY-MM-DD]]` link) plus the planner's optional time block, written as
 * plain text right after that link (`[[2026-11-17]] 14:00-15:00`).
 */
export interface TaskSchedule {
  readonly date: string
  /**
   * Null for a task scheduled on the day without a time (the all-day lane).
   */
  readonly time: TimeRange | null
}

export const MINUTES_PER_DAY = 1440
/**
 * The block length of a task dropped on the grid, or typed without an end time.
 */
export const DEFAULT_DURATION_MINUTES = 30

const WIKI_LINK_RE = /\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g
const TIME_RE = /^[ \t]*(\d{1,2}):(\d{2})(?:[ \t]*[-–][ \t]*(\d{1,2}):(\d{2}))?(?![\d:])/

interface DueLink {
  readonly to: number
  readonly date: string
}

/**
 * The first calendar-valid date link: the same link core reads as the due date.
 */
function findDueLink(markdown: string): DueLink | null {
  for (const match of markdown.matchAll(WIKI_LINK_RE)) {
    const target = match[1]
    const date = target === undefined ? undefined : normalizeWikiTarget(target).date
    if (date !== undefined) {
      return { to: match.index + match[0].length, date }
    }
  }
  return null
}

function toMinutes(hours: string | undefined, minutes: string | undefined): number | null {
  if (hours === undefined || minutes === undefined) {
    return null
  }
  const total = Number(hours) * 60 + Number(minutes)
  return Number(minutes) < 60 && total <= MINUTES_PER_DAY ? total : null
}

interface TimeToken {
  readonly length: number
  readonly time: TimeRange
}

function readTimeToken(rest: string): TimeToken | null {
  const match = TIME_RE.exec(rest)
  if (match === null) {
    return null
  }
  const start = toMinutes(match[1], match[2])
  if (start === null || start >= MINUTES_PER_DAY) {
    return null
  }
  const typedEnd = toMinutes(match[3], match[4])
  const end =
    typedEnd !== null && typedEnd > start
      ? typedEnd
      : Math.min(start + DEFAULT_DURATION_MINUTES, MINUTES_PER_DAY)
  return { length: match[0].length, time: { start, end } }
}

/**
 * The schedule a task's Markdown carries, or null when it has no due date.
 */
export function getTaskSchedule(markdown: string): TaskSchedule | null {
  const link = findDueLink(markdown)
  if (link === null) {
    return null
  }
  return { date: link.date, time: readTimeToken(markdown.slice(link.to))?.time ?? null }
}

function withoutTimeToken(markdown: string): string {
  const link = findDueLink(markdown)
  const token = link === null ? null : readTimeToken(markdown.slice(link.to))
  if (link === null || token === null) {
    return markdown
  }
  return markdown.slice(0, link.to) + markdown.slice(link.to + token.length)
}

/**
 * `HH:MM` on the 24-hour clock: the form the planner writes into notes.
 */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * The task's Markdown with its schedule replaced: the due-date link set (or
 * removed for `null`) through core's own helpers, and the time block rewritten
 * after it. Everything else in the task stays byte-for-byte.
 */
export function setTaskSchedule(markdown: string, schedule: TaskSchedule | null): string {
  const untimed = withoutTimeToken(markdown)
  if (schedule === null) {
    return withDraftDueDate(untimed, null)
  }
  const dated = withDraftDueDate(untimed, schedule.date)
  const link = findDueLink(dated)
  if (schedule.time === null || link === null) {
    return dated
  }
  const token = ` ${formatClock(schedule.time.start)}-${formatClock(schedule.time.end)}`
  return dated.slice(0, link.to) + token + dated.slice(link.to)
}
