import type { ReactElement } from 'react'
import { Inbox } from 'lucide-react'
import type { PlannerGroup } from './lib/task-group.ts'

/**
 * A list's mark: a ring in its colour, or the inbox tray. Reads the colour
 * from `--group-color`.
 */
export function GroupRing({ group }: { group: PlannerGroup }): ReactElement {
  return group.tag === null ? (
    <Inbox aria-hidden className="size-4 text-text-muted" />
  ) : (
    <span aria-hidden className="size-3.5 rounded-full border-2 border-(--group-color)" />
  )
}
