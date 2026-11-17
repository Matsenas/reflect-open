import { useCallback, useMemo } from 'react'
import { z } from 'zod'
import { useSettings } from '@/providers/settings-provider.tsx'
import {
  plannerGroupDefinitionsSchema,
  removeGroupDefinition,
  upsertGroupDefinition,
  type PlannerColorId,
  type PlannerGroupDefinition,
} from './lib/task-group.ts'

// Fork-only keys in the global settings document. Its schema keeps unknown
// keys, so they persist without a change to the upstream-owned schema.
const GROUPS_KEY = 'taskPlannerGroups'
const VIEW_KEY = 'tasksViewMode'

const viewModeSchema = z.enum(['list', 'planner']).catch('list')

/**
 * Which surface the Tasks route shows: Reflect's list or the week planner.
 */
export type TasksViewMode = z.infer<typeof viewModeSchema>

/**
 * The Tasks route's view mode, remembered across launches.
 */
export function useTasksViewMode(): [TasksViewMode, (mode: TasksViewMode) => void] {
  const { settings, updateSettings } = useSettings()
  const mode = viewModeSchema.parse(settings[VIEW_KEY])
  const setMode = useCallback(
    (next: TasksViewMode) => {
      updateSettings({ [VIEW_KEY]: next })
    },
    [updateSettings],
  )
  return [mode, setMode]
}

export interface PlannerGroupDefinitions {
  readonly definitions: readonly PlannerGroupDefinition[]
  /**
   * Store `tag` as a group with `color`, or recolour it.
   */
  readonly setColor: (tag: string, color: PlannerColorId) => void
  /**
   * Forget the stored group. Tasks keep their tag.
   */
  readonly remove: (tag: string) => void
}

/**
 * The stored planner groups (a tag and a colour each) and their updaters.
 */
export function usePlannerGroupDefinitions(): PlannerGroupDefinitions {
  const { settings, updateSettingsWith } = useSettings()
  const stored = settings[GROUPS_KEY]
  const definitions = useMemo(() => plannerGroupDefinitionsSchema.parse(stored), [stored])
  const setColor = useCallback(
    (tag: string, color: PlannerColorId) => {
      updateSettingsWith((current) => ({
        [GROUPS_KEY]: upsertGroupDefinition(
          plannerGroupDefinitionsSchema.parse(current[GROUPS_KEY]),
          tag,
          color,
        ),
      }))
    },
    [updateSettingsWith],
  )
  const remove = useCallback(
    (tag: string) => {
      updateSettingsWith((current) => ({
        [GROUPS_KEY]: removeGroupDefinition(
          plannerGroupDefinitionsSchema.parse(current[GROUPS_KEY]),
          tag,
        ),
      }))
    },
    [updateSettingsWith],
  )
  return { definitions, setColor, remove }
}
