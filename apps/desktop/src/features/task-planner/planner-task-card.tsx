import type { ReactElement } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils.ts'
import { dragId } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import { PLANNER_CARD_CLASS_NAME } from './planner-card-style.ts'
import { PlannerTaskContent } from './planner-task-content.tsx'

interface PlannerTaskCardProps {
  item: PlannerTask
  detail?: string | null
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
}

/**
 * A task in the planner's task list: drag it onto the calendar to schedule
 * it, or onto another group to move it. Double-click or Enter opens its note.
 */
export function PlannerTaskCard({
  item,
  detail = null,
  onToggle,
  onOpen,
}: PlannerTaskCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId('list', item.key),
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDoubleClick={(event) => onOpen(item, event.metaKey || event.ctrlKey)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          onOpen(item, event.metaKey || event.ctrlKey)
        }
        listeners?.onKeyDown?.(event)
      }}
      title={item.task.noteTitle}
      className={cn(
        PLANNER_CARD_CLASS_NAME,
        'cursor-grab touch-none px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isDragging && 'opacity-40',
      )}
    >
      <PlannerTaskContent item={item} detail={detail} onToggle={() => onToggle(item)} />
    </div>
  )
}
