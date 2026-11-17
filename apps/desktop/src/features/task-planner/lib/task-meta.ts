import { addDaysToIsoDate, addMonthsToIsoDate, getWeekday } from '@reflect/utils'

/**
 * How a task repeats. Completing a repeating task in the planner adds its
 * next occurrence.
 */
export const REPEAT_RULES = ['daily', 'weekdays', 'weekly', 'monthly'] as const

export type RepeatRule = (typeof REPEAT_RULES)[number]

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
}

/**
 * The durations the planner offers, in minutes.
 */
export const DURATION_CHOICES = [15, 30, 45, 60, 90, 120, 180] as const

// Both tokens are plain parenthesised text at a word boundary, so they read
// naturally in a note: `Gym (45m) (weekly)`.
const DURATION_RE = /(^|\s)\((?:(\d{1,2})h)?(?:(\d{1,3})m)?\)(?=\s|$)/
const REPEAT_RE = /(^|\s)\((daily|weekdays|weekly|monthly)\)(?=\s|$)/

interface Token<Value> {
  readonly from: number
  readonly to: number
  readonly value: Value
}

function findDuration(markdown: string): Token<number> | null {
  const match = DURATION_RE.exec(markdown)
  if (match === null || (match[2] === undefined && match[3] === undefined)) {
    return null
  }
  const minutes = Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  if (minutes <= 0) {
    return null
  }
  const from = match.index + (match[1]?.length ?? 0)
  return { from, to: match.index + match[0].length, value: minutes }
}

function findRepeat(markdown: string): Token<RepeatRule> | null {
  const match = REPEAT_RE.exec(markdown)
  const rule = REPEAT_RULES.find((candidate) => candidate === match?.[2])
  if (match === null || rule === undefined) {
    return null
  }
  const from = match.index + (match[1]?.length ?? 0)
  return { from, to: match.index + match[0].length, value: rule }
}

function withToken(
  markdown: string,
  existing: Token<unknown> | null,
  token: string | null,
): string {
  if (existing !== null) {
    const replaced = markdown.slice(0, existing.from) + (token ?? '') + markdown.slice(existing.to)
    return token === null ? replaced.replaceAll(/[ \t]{2,}/g, ' ').trim() : replaced
  }
  if (token === null) {
    return markdown
  }
  const trimmed = markdown.replace(/\s+$/, '')
  return trimmed.length > 0 ? `${trimmed} ${token}` : token
}

/**
 * `45m`, `1h` or `1h30m`: a duration as the planner writes and shows it.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours > 0 ? `${hours}h` : ''}${rest > 0 || hours === 0 ? `${rest}m` : ''}`
}

/**
 * The `(45m)` duration a task without a time block carries, or null.
 */
export function getTaskDuration(markdown: string): number | null {
  return findDuration(markdown)?.value ?? null
}

/**
 * The task's Markdown with its `(45m)` duration token set, or removed for `null`.
 */
export function setTaskDuration(markdown: string, minutes: number | null): string {
  const token = minutes === null ? null : `(${formatDuration(minutes)})`
  return withToken(markdown, findDuration(markdown), token)
}

/**
 * The task's `(weekly)`-style repeat rule, or null.
 */
export function getTaskRepeat(markdown: string): RepeatRule | null {
  return findRepeat(markdown)?.value ?? null
}

/**
 * The task's Markdown with its repeat token set, or removed for `null`.
 */
export function setTaskRepeat(markdown: string, rule: RepeatRule | null): string {
  return withToken(markdown, findRepeat(markdown), rule === null ? null : `(${rule})`)
}

/**
 * The day a repeating task comes round again after `date`.
 */
export function nextOccurrence(date: string, rule: RepeatRule): string {
  switch (rule) {
    case 'daily':
      return addDaysToIsoDate(date, 1)
    case 'weekly':
      return addDaysToIsoDate(date, 7)
    case 'monthly':
      return addMonthsToIsoDate(date, 1)
    case 'weekdays': {
      // Friday and Saturday skip the weekend (0 is Sunday).
      const weekday = getWeekday(date)
      return addDaysToIsoDate(date, weekday === 5 ? 3 : weekday === 6 ? 2 : 1)
    }
  }
}
