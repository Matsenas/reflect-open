import type { ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils.ts'
import { AddTaskInput } from './add-task-input.tsx'
import { GroupColorMenu } from './group-color-menu.tsx'
import type { DropTarget } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import { groupColorStyle } from './planner-card-style.ts'
import { PlannerTaskCard } from './planner-task-card.tsx'

interface PlannerGroupSectionProps {
  group: PlannerGroup
  /**
   * The group's open tasks that are not on the calendar yet.
   */
  items: readonly PlannerTask[]
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
  onAdd: (text: string, group: PlannerGroup) => void
  onColorChange: (group: PlannerGroup, color: PlannerColorId) => void
  onRemove: (group: PlannerGroup) => void
}

/**
 * One group in the planner's task list: its colour, name and unscheduled
 * tasks. The whole section is a drop zone: a task dropped here joins the
 * group, and comes off the calendar when it was dragged from there.
 */
export function PlannerGroupSection({
  group,
  items,
  onToggle,
  onOpen,
  onAdd,
  onColorChange,
  onRemove,
}: PlannerGroupSectionProps): ReactElement {
  const data: DropTarget = { kind: 'group', groupId: group.id }
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}`, data })
  return (
    <section
      ref={setNodeRef}
      aria-label={group.label}
      style={groupColorStyle(group.color)}
      className={cn(
        'rounded-lg px-1.5 py-1',
        isOver && 'bg-[color-mix(in_oklab,var(--group-color)_10%,transparent)]',
      )}
    >
      <div className="flex items-center gap-1">
        <GroupColorMenu
          group={group}
          onColorChange={(color) => onColorChange(group, color)}
          onRemove={() => onRemove(group)}
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-text">{group.label}</h3>
        <span className="flex-none text-2xs tabular-nums text-text-muted">{items.length}</span>
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {items.map((item) => (
          <PlannerTaskCard key={item.key} item={item} onToggle={onToggle} onOpen={onOpen} />
        ))}
        <AddTaskInput groupLabel={group.label} onAdd={(text) => onAdd(text, group)} />
      </div>
    </section>
  )
}
