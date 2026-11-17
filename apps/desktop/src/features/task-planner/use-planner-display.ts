import { useSessionFlag } from '@/lib/use-session-flag.ts'

/**
 * What the planner's todo list shows beyond open, unscheduled todos.
 */
export interface PlannerDisplay {
  /**
   * Todos that already sit on the calendar.
   */
  readonly scheduled: boolean
  /**
   * Todos completed in the last week, struck.
   */
  readonly completed: boolean
  /**
   * Lists with nothing to show.
   */
  readonly emptyLists: boolean
}

export interface PlannerDisplayControl {
  readonly display: PlannerDisplay
  readonly toggle: (key: keyof PlannerDisplay) => void
}

/**
 * The Display menu's switches, kept for the session like the Tasks filters.
 */
export function usePlannerDisplay(): PlannerDisplayControl {
  const [scheduled, setScheduled] = useSessionFlag('reflect.planner.display.scheduled', true)
  const [completed, setCompleted] = useSessionFlag('reflect.planner.display.completed', false)
  const [emptyLists, setEmptyLists] = useSessionFlag('reflect.planner.display.emptyLists', true)
  const display: PlannerDisplay = { scheduled, completed, emptyLists }
  const setters: Record<keyof PlannerDisplay, (next: boolean) => void> = {
    scheduled: setScheduled,
    completed: setCompleted,
    emptyLists: setEmptyLists,
  }
  return { display, toggle: (key) => setters[key](!display[key]) }
}
