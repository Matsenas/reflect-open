import type { ReactElement } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils.ts'
import { dragId } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import { groupColorStyle } from './planner-card-style.ts'
import { usePlanner } from './planner-context.ts'
import { PlannerTaskContent } from './planner-task-content.tsx'
import { PlannerTaskEditor } from './planner-task-editor.tsx'
import { TaskActionsMenu } from './task-actions-menu.tsx'

interface PlannerTaskRowProps {
  item: PlannerTask
  /**
   * How deep the row is nested under its parent todos.
   */
  depth?: number
}

/**
 * A todo in the list, with its subtodos beneath it. Click opens its editor,
 * the "…" on hover opens its actions, and dragging it puts it on the
 * calendar or into another list.
 */
export function PlannerTaskRow({ item, depth = 0 }: PlannerTaskRowProps): ReactElement {
  const { actions, colorOf, childrenOf, describe, expandedKey, setExpandedKey, setHoveredKey } =
    usePlanner()
  const expanded = expandedKey === item.key
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId('list', item.key),
    disabled: expanded || item.task.checked,
  })
  const { checked } = item.task
  return (
    <div style={groupColorStyle(colorOf(item.groupId))}>
      <div
        ref={setNodeRef}
        {...(expanded ? {} : attributes)}
        {...(expanded ? {} : listeners)}
        data-planner-row={item.key}
        onClick={() => {
          if (!expanded) {
            setExpandedKey(item.key)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === event.currentTarget) {
            event.stopPropagation()
            setExpandedKey(item.key)
          }
        }}
        onPointerEnter={() => setHoveredKey(item.key)}
        onPointerLeave={() => setHoveredKey(null)}
        style={{ marginLeft: depth * 20 }}
        className={cn(
          'group/row relative flex items-start gap-1 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          expanded ? 'bg-surface-hover py-2.5' : 'cursor-default touch-none hover:bg-surface-hover',
          isDragging && 'opacity-40',
        )}
      >
        {expanded ? (
          <>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={checked ? 'Reopen task' : 'Complete task'}
              onClick={() => actions.toggle(item)}
              className={cn(
                'mt-[5px] mr-1 flex size-3.5 flex-none items-center justify-center rounded-full border border-(--group-color) text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                checked && 'bg-(--group-color)',
              )}
            >
              {checked ? <Check aria-hidden strokeWidth={3} className="size-2.5" /> : null}
            </button>
            <PlannerTaskEditor item={item} />
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <PlannerTaskContent
                item={item}
                detail={describe(item)}
                onToggle={() => actions.toggle(item)}
              />
            </div>
            <TaskActionsMenu
              item={item}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
            />
          </>
        )}
      </div>
      {childrenOf(item.key).map((child) => (
        <PlannerTaskRow key={child.key} item={child} depth={depth + 1} />
      ))}
    </div>
  )
}
