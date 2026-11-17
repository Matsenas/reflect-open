import { z } from 'zod'

/**
 * What a planner drop zone stands for, carried as the droppable's data.
 */
export const dropTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('grid'), date: z.string() }),
  z.object({ kind: z.literal('allDay'), date: z.string() }),
  z.object({ kind: z.literal('group'), groupId: z.string() }),
])

export type DropTarget = z.infer<typeof dropTargetSchema>

/**
 * Where a dragged card started. A task can show in the task list and on the
 * calendar at once (an overdue task), so the two get distinct drag ids.
 */
export type DragSource = 'list' | 'calendar'

/**
 * The drag id of a task's card in `source`.
 */
export function dragId(source: DragSource, taskKey: string): string {
  return `${source}:${taskKey}`
}

/**
 * Split a drag id back into its source and task key.
 */
export function parseDragId(id: string | number): { source: DragSource; taskKey: string } | null {
  const text = String(id)
  for (const source of ['list', 'calendar'] as const) {
    if (text.startsWith(`${source}:`)) {
      return { source, taskKey: text.slice(source.length + 1) }
    }
  }
  return null
}
