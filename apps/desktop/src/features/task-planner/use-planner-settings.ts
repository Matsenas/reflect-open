import { useCallback, useMemo } from 'react'
import { useSettings } from '@/providers/settings-provider.tsx'
import {
  plannerGroupDefinitionsSchema,
  removeGroupDefinition,
  upsertGroupDefinition,
  type PlannerColorId,
  type PlannerGroupDefinition,
} from './lib/task-group.ts'

// A fork-only key in the global settings document. Its schema keeps unknown
// keys, so it persists without a change to the upstream-owned schema.
const GROUPS_KEY = 'taskPlannerGroups'

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
