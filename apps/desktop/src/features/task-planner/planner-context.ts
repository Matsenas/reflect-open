import { createContext, use } from 'react'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import type { PlannerActions } from './use-planner-actions.ts'

/**
 * What every planner card and row needs: the task model, the groups, the
 * writes, and which row is being edited.
 */
export interface PlannerContextValue {
  readonly groups: readonly PlannerGroup[]
  readonly colorOf: (groupId: string) => PlannerColorId
  /**
   * A task's subtodos that the list currently shows, in note order.
   */
  readonly childrenOf: (taskKey: string) => readonly PlannerTask[]
  readonly actions: PlannerActions
  readonly today: string
  /**
   * The row whose editor is open, if any.
   */
  readonly expandedKey: string | null
  readonly setExpandedKey: (taskKey: string | null) => void
  /**
   * The row under the pointer: what the single-key shortcuts act on.
   */
  readonly setHoveredKey: (taskKey: string | null) => void
  /**
   * A one-line summary of a task's date, time, length and repeat, or null.
   */
  readonly describe: (item: PlannerTask) => string | null
  readonly openNote: (item: PlannerTask, openInNewWindow: boolean) => void
}

export const PlannerContext = createContext<PlannerContextValue | null>(null)

/**
 * The planner's shared state. Use inside `TaskPlannerScreen`.
 */
export function usePlanner(): PlannerContextValue {
  const value = use(PlannerContext)
  if (value === null) {
    throw new Error('usePlanner must be used inside the task planner')
  }
  return value
}
