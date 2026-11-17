import { useMemo } from 'react'
import { errorMessage, todaysDailyTarget, type OpenTask } from '@reflect/core'
import { useAppServices, useCoreServices } from '@/services/services-provider.tsx'
import { setTaskGroupTag } from './lib/task-group.ts'
import { setTaskSchedule, type TaskSchedule } from './lib/task-schedule.ts'

/**
 * A change to where a task sits: its schedule, its group, or both. A field
 * left `undefined` keeps its current value.
 */
export interface TaskPlacement {
  readonly schedule?: TaskSchedule | null
  readonly groupTag?: string | null
}

/**
 * The planner's writes. Each goes through `TaskService`, so it edits the
 * task's line in its note, shows optimistically, and rolls back on failure;
 * a failure surfaces once as a failed operation.
 */
export interface PlannerActions {
  /**
   * Move a task on the calendar and/or to another group, in one note write.
   */
  readonly place: (task: OpenTask, placement: TaskPlacement) => void
  /**
   * Check or uncheck a task.
   */
  readonly toggle: (task: OpenTask) => void
  /**
   * Add a task to today's daily note, tagged for the group.
   */
  readonly add: (text: string, groupTag: string | null) => void
}

export function usePlannerActions(today: string): PlannerActions {
  const { tasks: taskService } = useCoreServices()
  const { operations } = useAppServices()

  return useMemo(() => {
    const run = (label: string, write: () => Promise<unknown>): void => {
      write().catch((cause: unknown) => {
        operations.start(label).fail(errorMessage(cause))
      })
    }
    return {
      place: (task, placement) => {
        let content = task.markdown
        if (placement.schedule !== undefined) {
          content = setTaskSchedule(content, placement.schedule)
        }
        if (placement.groupTag !== undefined) {
          content = setTaskGroupTag(content, placement.groupTag)
        }
        if (content !== task.markdown) {
          run('Moving task', () => taskService.editTask(task, content))
        }
      },
      toggle: (task) => {
        run(task.checked ? 'Reopening task' : 'Completing task', () => {
          return taskService.editAndToggleTask(task, null)
        })
      },
      add: (text, groupTag) => {
        run('Adding task', async () => {
          const created = await taskService.addTask(todaysDailyTarget(today))
          await taskService.editTask(created, setTaskGroupTag(text, groupTag))
        })
      },
    }
  }, [operations, taskService, today])
}
