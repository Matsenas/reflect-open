import type { ReactElement, RefObject } from 'react'
import { Asterisk } from 'lucide-react'
import { DisplayMenu } from './display-menu.tsx'
import { GroupRing } from './group-ring.tsx'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'
import { NewTodoInput } from './new-todo-input.tsx'
import { groupColorStyle } from './planner-card-style.ts'
import { usePlanner } from './planner-context.ts'
import { PlannerGroupSection } from './planner-group-section.tsx'
import { ALL_TAB, PlannerTabs } from './planner-tabs.tsx'
import type { PlannerDisplayControl } from './use-planner-display.ts'

interface PlannerSidebarProps {
  /**
   * Each list's top-level todos to show, by group id.
   */
  listed: ReadonlyMap<string, readonly PlannerTask[]>
  /**
   * Each list's open todo count, by group id.
   */
  counts: ReadonlyMap<string, number>
  total: number
  /**
   * The selected tab: a group id, or `ALL_TAB`.
   */
  tab: string
  onTabChange: (tab: string) => void
  displayControl: PlannerDisplayControl
  newTodoRef: RefObject<HTMLInputElement | null>
  onAdd: (text: string) => void
  onColorChange: (group: PlannerGroup, color: PlannerColorId) => void
  onRemoveGroup: (group: PlannerGroup) => void
  onCreateGroup: (tag: string, color: PlannerColorId) => void
}

/**
 * The planner's todo panel: list tabs, the current list's title with the
 * Display menu, the new-todo field, then the lists with their todos.
 */
export function PlannerSidebar({
  listed,
  counts,
  total,
  tab,
  onTabChange,
  displayControl,
  newTodoRef,
  onAdd,
  onColorChange,
  onRemoveGroup,
  onCreateGroup,
}: PlannerSidebarProps): ReactElement {
  const { groups, setExpandedKey } = usePlanner()
  const current = groups.find((group) => group.id === tab)
  const shown = groups.filter((group) => {
    if (tab !== ALL_TAB) {
      return group.id === tab
    }
    return displayControl.display.emptyLists || (listed.get(group.id)?.length ?? 0) > 0
  })
  return (
    <aside
      aria-label="Todos"
      className="flex w-80 flex-none flex-col border-r border-border xl:w-96"
    >
      <PlannerTabs
        groups={groups}
        counts={counts}
        total={total}
        selected={tab}
        onSelect={onTabChange}
        onCreateGroup={onCreateGroup}
      />
      <div
        style={current === undefined ? undefined : groupColorStyle(current.color)}
        className="flex flex-none items-center gap-2 px-5 pb-3 pt-5"
      >
        <span className="flex size-5 flex-none items-center justify-center">
          {current === undefined ? (
            <Asterisk aria-hidden className="size-5 text-text-secondary" />
          ) : (
            <GroupRing group={current} />
          )}
        </span>
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-lg font-semibold tracking-tight text-text">
          <span className="truncate">{current?.label ?? 'All'}</span>
          <span className="flex-none font-normal tabular-nums text-text-muted">
            {current === undefined ? total : (counts.get(current.id) ?? 0)}
          </span>
        </h2>
        <DisplayMenu {...displayControl} />
      </div>
      <NewTodoInput inputRef={newTodoRef} onAdd={onAdd} />
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setExpandedKey(null)
          }
        }}
        className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-6"
      >
        {shown.map((group) => (
          <PlannerGroupSection
            key={group.id}
            group={group}
            items={listed.get(group.id) ?? []}
            count={counts.get(group.id) ?? 0}
            onColorChange={onColorChange}
            onRemove={onRemoveGroup}
          />
        ))}
      </div>
    </aside>
  )
}
