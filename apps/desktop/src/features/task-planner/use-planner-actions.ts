import { useMemo } from 'react'
import { AppError, errorMessage, todaysDailyTarget } from '@reflect/core'
import { useAppServices, useCoreServices } from '@/services/services-provider.tsx'
import { placeTask, retitleTask, type PlannerTask, type TaskPlacement } from './lib/planner-task.ts'
import { addSubtask, readTaskNotes, setTaskNotes, type TaskLine } from './lib/task-children.ts'
import { setTaskGroupTag } from './lib/task-group.ts'
import { nextOccurrence } from './lib/task-meta.ts'
import { MINUTES_PER_DAY } from './lib/task-schedule.ts'
import { SNAP_MINUTES } from './lib/week-layout.ts'

/**
 * The planner's writes. Every one edits the task's note: a change to the
 * task's own line goes through `TaskService` (optimistic, rolled back on
 * failure), and a change beneath it (notes, subtodos) is a source edit of the
 * note. A failure surfaces once as a failed operation.
 */
export interface PlannerActions {
  /**
   * Change a task's schedule, group, duration and/or repeat in one write.
   */
  readonly place: (item: PlannerTask, placement: TaskPlacement) => void
  /**
   * Check or uncheck a task. Checking a repeating task adds its next occurrence.
   */
  readonly toggle: (item: PlannerTask) => void
  /**
   * Add a task to today's daily note, tagged for the group.
   */
  readonly add: (text: string, groupTag: string | null) => void
  readonly remove: (item: PlannerTask) => void
  /**
   * Add a copy of the task right after it in its note.
   */
  readonly duplicate: (item: PlannerTask) => void
  readonly rename: (item: PlannerTask, title: string) => void
  /**
   * Put the task on today's calendar starting now, for its duration.
   */
  readonly startNow: (item: PlannerTask) => void
  readonly addSubtask: (item: PlannerTask, text: string) => void
  /**
   * The task's notes: the plain bullets directly under it in its note.
   */
  readonly readNotes: (item: PlannerTask) => Promise<string>
  readonly setNotes: (item: PlannerTask, notes: string) => void
  readonly copyTitle: (item: PlannerTask) => void
}

function lineOf(item: PlannerTask): TaskLine {
  return { markdown: item.task.markdown, checked: item.task.checked, occurrence: item.occurrence }
}

export function usePlannerActions(today: string): PlannerActions {
  const {
    tasks: taskService,
    noteDocuments,
    graphSession,
    indexLifecycle,
    clock,
  } = useCoreServices()
  const { operations, clipboard } = useAppServices()

  return useMemo(() => {
    const run = (label: string, write: () => Promise<unknown>): void => {
      write().catch((cause: unknown) => {
        operations.start(label).fail(errorMessage(cause))
      })
    }
    const edit = (label: string, item: PlannerTask, markdown: string): void => {
      if (markdown !== item.task.markdown) {
        run(label, () => taskService.editTask(item.task, markdown))
      }
    }
    const editSource = async (
      item: PlannerTask,
      transform: (source: string) => string,
    ): Promise<void> => {
      const { session } = graphSession.getState()
      if (session === null) {
        throw new AppError('noGraph', 'No graph is open.')
      }
      await noteDocuments.commitSourceEdit(item.task.notePath, transform, {
        generation: session.generation,
      })
      // The index trails a file write by the watcher's debounce. Index the
      // note now so the new subtodo or note shows at once.
      if (session.indexGeneration !== null) {
        await indexLifecycle.indexNote(item.task.notePath, {
          generation: session.indexGeneration,
          fileGeneration: session.generation,
        })
        await taskService.refresh()
      }
    }
    const copyAfter = async (item: PlannerTask, markdown: string): Promise<void> => {
      const created = await taskService.addTaskAfter(item.task, null)
      await taskService.editTask(created, markdown)
    }

    return {
      place: (item, placement) => edit('Moving task', item, placeTask(item, placement)),
      toggle: (item) => {
        const { task, repeat, schedule } = item
        run(task.checked ? 'Reopening task' : 'Completing task', async () => {
          if (!task.checked && repeat !== null) {
            const next = {
              date: nextOccurrence(schedule?.date ?? today, repeat),
              time: schedule?.time ?? null,
            }
            await copyAfter(item, placeTask(item, { schedule: next }))
          }
          await taskService.editAndToggleTask(task, null)
        })
      },
      add: (text, groupTag) => {
        run('Adding task', async () => {
          const created = await taskService.addTask(todaysDailyTarget(today))
          await taskService.editTask(created, setTaskGroupTag(text, groupTag))
        })
      },
      remove: (item) => run('Deleting task', () => taskService.deleteTasks([item.task])),
      duplicate: (item) => run('Duplicating task', () => copyAfter(item, item.task.markdown)),
      rename: (item, title) => {
        if (title.trim() !== '' && title.trim() !== item.title) {
          edit('Editing task', item, retitleTask(item, title))
        }
      },
      startNow: (item) => {
        const now = new Date(clock.now())
        const minutes = now.getHours() * 60 + now.getMinutes()
        const snapped = Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES
        const start = Math.min(snapped, MINUTES_PER_DAY - item.duration)
        const time = { start, end: start + item.duration }
        edit('Moving task', item, placeTask(item, { schedule: { date: today, time } }))
      },
      addSubtask: (item, text) => {
        if (text.trim() !== '') {
          run('Adding subtodo', () => {
            return editSource(item, (source) => addSubtask(source, lineOf(item), text))
          })
        }
      },
      readNotes: async (item) => {
        return readTaskNotes(await noteDocuments.readSource(item.task.notePath), lineOf(item))
      },
      setNotes: (item, notes) => {
        run('Saving notes', () => {
          return editSource(item, (source) => setTaskNotes(source, lineOf(item), notes))
        })
      },
      copyTitle: (item) => {
        run('Copying title', async () => {
          await clipboard.writeText(item.title)
        })
      },
    }
  }, [
    clipboard,
    clock,
    graphSession,
    indexLifecycle,
    noteDocuments,
    operations,
    taskService,
    today,
  ])
}
