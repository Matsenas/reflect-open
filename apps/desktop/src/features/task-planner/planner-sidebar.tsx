import type { ReactElement } from 'react'
import { formatShortDate } from '@reflect/core'
import { useSettings } from '@/providers/settings-provider.tsx'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import { NewGroupPopover } from './new-group-popover.tsx'
import { groupColorStyle } from './planner-card-style.ts'
import { PlannerGroupSection } from './planner-group-section.tsx'
import { PlannerTaskCard } from './planner-task-card.tsx'

interface PlannerSidebarProps {
  groups: readonly PlannerGroup[]
  /**
   * Open tasks without a date, by group id.
   */
  unscheduled: ReadonlyMap<string, readonly PlannerTask[]>
  /**
   * Open tasks whose date has passed, oldest first.
   */
  overdue: readonly PlannerTask[]
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
  onAdd: (text: string, group: PlannerGroup) => void
  onColorChange: (group: PlannerGroup, color: PlannerColorId) => void
  onRemoveGroup: (group: PlannerGroup) => void
  onCreateGroup: (tag: string, color: PlannerColorId) => void
}

/**
 * The planner's task list: overdue tasks to re-plan, then every group with
 * the tasks still waiting for a slot.
 */
export function PlannerSidebar({
  groups,
  unscheduled,
  overdue,
  onToggle,
  onOpen,
  onAdd,
  onColorChange,
  onRemoveGroup,
  onCreateGroup,
}: PlannerSidebarProps): ReactElement {
  const { settings } = useSettings()
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  return (
    <aside
      aria-label="Tasks to plan"
      className="flex w-64 flex-none flex-col border-r border-border xl:w-72"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 py-2">
        {overdue.length > 0 ? (
          <section aria-label="Overdue" className="px-1.5 py-1">
            <div className="flex items-center gap-1 pl-1">
              <h3 className="min-w-0 flex-1 text-xs font-medium text-red-500">Overdue</h3>
              <span className="flex-none text-2xs tabular-nums text-text-muted">
                {overdue.length}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-1">
              {overdue.map((item) => (
                <div
                  key={item.key}
                  style={groupColorStyle(groupsById.get(item.groupId)?.color ?? 'gray')}
                >
                  <PlannerTaskCard
                    item={item}
                    detail={
                      item.schedule === null
                        ? null
                        : formatShortDate(item.schedule.date, settings.dateFormat)
                    }
                    onToggle={onToggle}
                    onOpen={onOpen}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {groups.map((group) => (
          <PlannerGroupSection
            key={group.id}
            group={group}
            items={unscheduled.get(group.id) ?? []}
            onToggle={onToggle}
            onOpen={onOpen}
            onAdd={onAdd}
            onColorChange={onColorChange}
            onRemove={onRemoveGroup}
          />
        ))}
      </div>
      <div className="flex-none border-t border-border px-2 py-1.5">
        <NewGroupPopover onCreate={onCreateGroup} />
      </div>
    </aside>
  )
}
