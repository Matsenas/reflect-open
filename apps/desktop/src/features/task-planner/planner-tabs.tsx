import type { ReactElement } from 'react'
import { cn } from '@/lib/utils.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import { NewGroupPopover } from './new-group-popover.tsx'

/**
 * The tab that shows every list.
 */
export const ALL_TAB = '*'

interface PlannerTabsProps {
  groups: readonly PlannerGroup[]
  counts: ReadonlyMap<string, number>
  total: number
  /**
   * A group id, or {@link ALL_TAB}.
   */
  selected: string
  onSelect: (tab: string) => void
  onCreateGroup: (tag: string, color: PlannerColorId) => void
}

/**
 * The list tabs across the top of the todo panel: All, then one per list
 * with its open count, then "+" for a new list.
 */
export function PlannerTabs({
  groups,
  counts,
  total,
  selected,
  onSelect,
  onCreateGroup,
}: PlannerTabsProps): ReactElement {
  const tabs = [
    { id: ALL_TAB, label: 'All', count: total },
    ...groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: counts.get(group.id) ?? 0,
    })),
  ]
  return (
    <div className="flex flex-none items-center gap-1 px-3 pt-2.5">
      <div
        role="tablist"
        aria-label="Lists"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50',
              selected === tab.id && 'bg-surface-hover text-text',
            )}
          >
            {tab.label}
            <span className="text-xs font-normal tabular-nums text-text-muted">{tab.count}</span>
          </button>
        ))}
      </div>
      <NewGroupPopover onCreate={onCreateGroup} />
    </div>
  )
}
