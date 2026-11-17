import type { CSSProperties } from 'react'
import { plannerColorValue, type PlannerColorId } from './lib/task-group.ts'

/**
 * The shared look of a task card in a group's colour: a tinted fill over the
 * app surface and a solid leading edge. Pair with {@link groupColorStyle}.
 */
export const PLANNER_CARD_CLASS_NAME =
  'rounded-md border-l-[3px] border-(--group-color) bg-[color-mix(in_oklab,var(--group-color)_14%,var(--surface))] text-text'

/**
 * The inline style that hands a group's colour to its cards and dots.
 */
export function groupColorStyle(color: PlannerColorId): CSSProperties {
  return { '--group-color': plannerColorValue(color) } as CSSProperties
}
