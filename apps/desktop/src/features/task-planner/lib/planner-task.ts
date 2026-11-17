import { getTaskKey, type OpenTask } from '@reflect/core'
import { getTaskGroupId, setTaskGroupTag } from './task-group.ts'
import { getTaskSchedule, setTaskSchedule, type TaskSchedule } from './task-schedule.ts'

/**
 * A Reflect task as the planner reads it: the row itself plus the schedule and
 * the group its Markdown carries.
 */
export interface PlannerTask {
  readonly key: string
  readonly task: OpenTask
  readonly schedule: TaskSchedule | null
  readonly groupId: string
  /**
   * The task's Markdown without its date, time and group tag: what a card
   * shows, since the calendar position and the colour already say the rest.
   */
  readonly title: string
}

/**
 * Read the planner's view of one task row.
 */
export function toPlannerTask(task: OpenTask): PlannerTask {
  return {
    key: getTaskKey(task),
    task,
    schedule: getTaskSchedule(task.markdown),
    groupId: getTaskGroupId(task.markdown),
    title: setTaskGroupTag(setTaskSchedule(task.markdown, null), null),
  }
}

/**
 * Order for cards that share a lane: by start time, then by title.
 */
export function comparePlannerTasks(left: PlannerTask, right: PlannerTask): number {
  const leftStart = left.schedule?.time?.start ?? -1
  const rightStart = right.schedule?.time?.start ?? -1
  return leftStart - rightStart || left.title.localeCompare(right.title)
}
