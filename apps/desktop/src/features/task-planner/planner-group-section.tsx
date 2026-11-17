import type { ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSessionFlag } from '@/lib/use-session-flag.ts'
import { cn } from '@/lib/utils.ts'
import { GroupColorMenu } from './group-color-menu.tsx'
import type { DropTarget } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import { groupColorStyle } from './planner-card-style.ts'
import { PlannerTaskRow } from './planner-task-row.tsx'

interface PlannerGroupSectionProps {
  group: PlannerGroup
  /**
   * The list's top-level todos; subtodos render under their parent.
   */
  items: readonly PlannerTask[]
  /**
   * The list's open todos, subtodos included.
   */
  count: number
  onColorChange: (group: PlannerGroup, color: PlannerColorId) => void
  onRemove: (group: PlannerGroup) => void
}

/**
 * One list in the todo panel: a collapsible header with the list's colour
 * ring, name and open count, over its todos. The whole section is a drop
 * zone: a todo dropped here joins the list, and comes off the calendar when
 * it was dragged from there.
 */
export function PlannerGroupSection({
  group,
  items,
  count,
  onColorChange,
  onRemove,
}: PlannerGroupSectionProps): ReactElement {
  const data: DropTarget = { kind: 'group', groupId: group.id }
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}`, data })
  const [collapsed, setCollapsed] = useSessionFlag(`reflect.planner.collapsed.${group.id}`, false)
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <section
      ref={setNodeRef}
      aria-label={group.label}
      style={groupColorStyle(group.color)}
      className={cn(
        'rounded-lg',
        isOver && 'bg-[color-mix(in_oklab,var(--group-color)_10%,transparent)]',
      )}
    >
      <div className="flex h-9 items-center gap-1 pr-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
          onClick={() => setCollapsed(!collapsed)}
          className="flex size-6 flex-none items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Chevron aria-hidden className="size-3.5" />
        </button>
        <GroupColorMenu
          group={group}
          onColorChange={(color) => onColorChange(group, color)}
          onRemove={() => onRemove(group)}
        />
        <h3 className="flex min-w-0 items-baseline gap-1.5 pl-1 text-sm font-medium text-text">
          <span className="truncate">{group.label}</span>
          <span className="flex-none font-normal tabular-nums text-text-muted">{count}</span>
        </h3>
      </div>
      {collapsed ? null : (
        <div className="flex flex-col pl-6">
          {items.map((item) => (
            <PlannerTaskRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
