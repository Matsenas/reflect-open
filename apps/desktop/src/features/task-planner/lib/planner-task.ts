import { getTaskKey, type OpenTask } from '@reflect/core'
import { getTaskGroupId, getTaskGroupTag, INBOX_GROUP_ID, setTaskGroupTag } from './task-group.ts'
import {
  getTaskDuration,
  getTaskRepeat,
  setTaskDuration,
  setTaskRepeat,
  type RepeatRule,
} from './task-meta.ts'
import {
  DEFAULT_DURATION_MINUTES,
  getTaskSchedule,
  MINUTES_PER_DAY,
  setTaskSchedule,
  type TaskSchedule,
} from './task-schedule.ts'

/**
 * A Reflect task as the planner reads it: the row itself plus everything its
 * Markdown and its place in the note say about it.
 */
export interface PlannerTask {
  readonly key: string
  readonly task: OpenTask
  readonly schedule: TaskSchedule | null
  /**
   * The task's own group, or its parent task's when it has no tag of its own.
   */
  readonly groupId: string
  /**
   * How long the task takes, in minutes: its time block's length, else its
   * `(45m)` token, else the default.
   */
  readonly duration: number
  readonly repeat: RepeatRule | null
  /**
   * The task's Markdown without its date, time, group tag, duration and
   * repeat: what a card shows, since the planner draws the rest.
   */
  readonly title: string
  /**
   * The key of the task this one is a subtodo of, or null.
   */
  readonly parentKey: string | null
  /**
   * Which of its note's identical task lines this is, counting from 0.
   */
  readonly occurrence: number
}

/**
 * A task's Markdown reduced to its title.
 */
export function getTaskTitle(markdown: string): string {
  const untagged = setTaskGroupTag(setTaskSchedule(markdown, null), null)
  return setTaskRepeat(setTaskDuration(untagged, null), null)
}

function durationOfMarkdown(markdown: string, schedule: TaskSchedule | null): number {
  if (schedule !== null && schedule.time !== null) {
    return schedule.time.end - schedule.time.start
  }
  return getTaskDuration(markdown) ?? DEFAULT_DURATION_MINUTES
}

function comparePaths(left: readonly number[], right: readonly number[]): number {
  const shared = Math.min(left.length, right.length)
  for (let index = 0; index < shared; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }
  return left.length - right.length
}

function isAncestorPath(ancestor: readonly number[], path: readonly number[]): boolean {
  return ancestor.length < path.length && ancestor.every((step, index) => step === path[index])
}

/**
 * Read every task row into the planner's model, keyed by task key, in
 * document order per note. A task nested under another task in its note
 * becomes that task's subtodo and shares its group unless it has its own tag.
 */
export function buildPlannerTasks(rows: readonly OpenTask[]): Map<string, PlannerTask> {
  const byNote = new Map<string, OpenTask[]>()
  for (const row of rows) {
    byNote.set(row.notePath, [...(byNote.get(row.notePath) ?? []), row])
  }
  const items = new Map<string, PlannerTask>()
  for (const noteRows of byNote.values()) {
    noteRows.sort((left, right) => comparePaths(left.astPath, right.astPath))
    const placed: PlannerTask[] = []
    const seen = new Map<string, number>()
    for (const task of noteRows) {
      // The nearest task above this one in the outline is the last ancestor
      // in document order.
      const parent = placed.findLast((candidate) => {
        return isAncestorPath(candidate.task.astPath, task.astPath)
      })
      const ownGroup = getTaskGroupId(task.markdown)
      const schedule = getTaskSchedule(task.markdown)
      const lineKey = `${task.checked ? 'x' : ' '}${task.markdown}`
      const occurrence = seen.get(lineKey) ?? 0
      seen.set(lineKey, occurrence + 1)
      const item: PlannerTask = {
        key: getTaskKey(task),
        task,
        schedule,
        groupId: ownGroup === INBOX_GROUP_ID && parent !== undefined ? parent.groupId : ownGroup,
        duration: durationOfMarkdown(task.markdown, schedule),
        repeat: getTaskRepeat(task.markdown),
        title: getTaskTitle(task.markdown),
        parentKey: parent?.key ?? null,
        occurrence,
      }
      placed.push(item)
      items.set(item.key, item)
    }
  }
  return items
}

/**
 * A change to a task's place or planning details. A field left `undefined`
 * keeps its current value.
 */
export interface TaskPlacement {
  readonly schedule?: TaskSchedule | null
  readonly groupTag?: string | null
  readonly duration?: number
  readonly repeat?: RepeatRule | null
}

/**
 * The task's Markdown after `placement`. The duration lives in the time block
 * while the task has one and in a `(45m)` token otherwise, so it survives a
 * move on and off the grid; the default length is never written.
 */
export function placeTask(item: PlannerTask, placement: TaskPlacement): string {
  const duration = placement.duration ?? item.duration
  let schedule = placement.schedule === undefined ? item.schedule : placement.schedule
  if (placement.duration !== undefined && schedule !== null && schedule.time !== null) {
    const start = Math.min(schedule.time.start, MINUTES_PER_DAY - duration)
    schedule = { date: schedule.date, time: { start, end: start + duration } }
  }
  const isTimed = schedule !== null && schedule.time !== null
  let markdown = setTaskSchedule(item.task.markdown, schedule)
  markdown = setTaskDuration(
    markdown,
    isTimed || duration === DEFAULT_DURATION_MINUTES ? null : duration,
  )
  if (placement.repeat !== undefined) {
    markdown = setTaskRepeat(markdown, placement.repeat)
  }
  if (placement.groupTag !== undefined) {
    markdown = setTaskGroupTag(markdown, placement.groupTag)
  }
  return markdown
}

/**
 * The task's Markdown with a new title and everything else the planner
 * stores on it kept. A `#tag` typed into the title wins over the old group.
 */
export function retitleTask(item: PlannerTask, title: string): string {
  const { markdown } = item.task
  let next = title.trim()
  if (getTaskGroupTag(next) === null) {
    next = setTaskGroupTag(next, getTaskGroupTag(markdown))
  }
  next = setTaskSchedule(next, getTaskSchedule(markdown))
  next = setTaskDuration(next, getTaskDuration(markdown))
  return setTaskRepeat(next, getTaskRepeat(markdown))
}

/**
 * Order for cards that share a lane: by start time, then by title.
 */
export function comparePlannerTasks(left: PlannerTask, right: PlannerTask): number {
  const leftStart = left.schedule?.time?.start ?? -1
  const rightStart = right.schedule?.time?.start ?? -1
  return leftStart - rightStart || left.title.localeCompare(right.title)
}
