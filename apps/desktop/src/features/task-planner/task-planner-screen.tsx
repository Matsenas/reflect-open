import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { addDaysToIsoDate } from '@reflect/utils'
import { getUserWeekStart } from '@reflect/core'
import { routeForPath } from '@reflect/app'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation.ts'
import { useToday } from '@/lib/use-today.ts'
import { useSettings } from '@/providers/settings-provider.tsx'
import { useCoreServices } from '@/services/services-provider.tsx'
import { useServiceState } from '@/services/use-service-state.ts'
import type { DragSource } from './lib/planner-dnd.ts'
import { comparePlannerTasks, toPlannerTask, type PlannerTask } from './lib/planner-task.ts'
import { resolvePlannerGroups, type PlannerColorId, type PlannerGroup } from './lib/task-group.ts'
import type { TimeRange } from './lib/task-schedule.ts'
import { getWeekDays } from './lib/week-layout.ts'
import { groupColorStyle, PLANNER_CARD_CLASS_NAME } from './planner-card-style.ts'
import { PlannerHeader } from './planner-header.tsx'
import { PlannerSidebar } from './planner-sidebar.tsx'
import { PlannerTaskContent } from './planner-task-content.tsx'
import { usePlannerActions } from './use-planner-actions.ts'
import { usePlannerDrag, type PlannerDrop } from './use-planner-drag.ts'
import { usePlannerGroupDefinitions } from './use-planner-settings.ts'
import { WeekGrid } from './week-grid.tsx'

function isTypingTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The week planner: Reflect's own tasks, grouped by `#tag` into coloured
 * groups on the left, and a week calendar on the right to drag them into.
 *
 * Nothing here is a second task store. A group is the task's first tag, a
 * calendar slot is its `[[YYYY-MM-DD]]` due date plus an optional `HH:MM-HH:MM`
 * after it, and every drop is one edit of the task's line in its note. So the
 * Tasks list, the notes and this view always show the same tasks.
 *
 * ← / → change the week and T returns to today.
 */
export function TaskPlannerScreen(): ReactElement {
  const { tasks: taskService } = useCoreServices()
  const { settings } = useSettings()
  const today = useToday()
  const navigateNoteLink = useNoteLinkNavigation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [weekStart, setWeekStart] = useState(() => getUserWeekStart(today, settings.weekStartDay))
  const days = useMemo(() => getWeekDays(weekStart), [weekStart])
  const goToToday = useCallback(() => {
    setWeekStart(getUserWeekStart(today, settings.weekStartDay))
  }, [settings.weekStartDay, today])

  const { open, completed, openFailed } = useServiceState(taskService, taskService.getState)
  // Completed tasks stay on the calendar, struck, as a record of the week.
  useEffect(() => taskService.includeCompleted(), [taskService])

  const openItems = useMemo(() => (open ?? []).map(toPlannerTask), [open])
  const itemsByKey = useMemo(() => {
    const items = new Map<string, PlannerTask>()
    for (const task of completed ?? []) {
      const item = toPlannerTask(task)
      if (item.schedule !== null) {
        items.set(item.key, item)
      }
    }
    for (const item of openItems) {
      items.set(item.key, item)
    }
    return items
  }, [completed, openItems])

  const { definitions, setColor, remove } = usePlannerGroupDefinitions()
  const groups = useMemo(() => {
    return resolvePlannerGroups(
      definitions,
      [...itemsByKey.values()].map((item) => item.groupId),
    )
  }, [definitions, itemsByKey])
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const colorOf = useCallback(
    (groupId: string): PlannerColorId => groupsById.get(groupId)?.color ?? 'gray',
    [groupsById],
  )

  const itemsByDate = useMemo(() => {
    const byDate = new Map<string, PlannerTask[]>()
    for (const item of itemsByKey.values()) {
      if (item.schedule !== null) {
        byDate.set(item.schedule.date, [...(byDate.get(item.schedule.date) ?? []), item])
      }
    }
    for (const items of byDate.values()) {
      items.sort(comparePlannerTasks)
    }
    return byDate
  }, [itemsByKey])
  const unscheduled = useMemo(() => {
    const byGroup = new Map<string, PlannerTask[]>()
    for (const item of openItems) {
      if (item.schedule === null) {
        byGroup.set(item.groupId, [...(byGroup.get(item.groupId) ?? []), item])
      }
    }
    return byGroup
  }, [openItems])
  const overdue = useMemo(() => {
    return openItems
      .filter((item) => item.schedule !== null && item.schedule.date < today)
      .sort((left, right) => {
        return (left.schedule?.date ?? '').localeCompare(right.schedule?.date ?? '')
      })
  }, [openItems, today])

  const actions = usePlannerActions(today)
  const onToggle = useCallback((item: PlannerTask) => actions.toggle(item.task), [actions])
  const onOpen = useCallback(
    (item: PlannerTask, openInNewWindow: boolean) => {
      navigateNoteLink({ target: routeForPath(item.task.notePath), openInNewWindow })
    },
    [navigateNoteLink],
  )
  const onResize = useCallback(
    (item: PlannerTask, time: TimeRange) => {
      if (item.schedule !== null) {
        actions.place(item.task, { schedule: { date: item.schedule.date, time } })
      }
    },
    [actions],
  )
  const onAdd = useCallback(
    (text: string, group: PlannerGroup) => actions.add(text, group.tag),
    [actions],
  )
  const onDrop = useCallback(
    (item: PlannerTask, source: DragSource, drop: PlannerDrop) => {
      if (drop.kind === 'schedule') {
        actions.place(item.task, { schedule: drop.schedule })
        return
      }
      const group = groupsById.get(drop.groupId)
      if (group === undefined) {
        return
      }
      // A card dragged off the calendar into the list is unscheduled too; a
      // card moved within the list only changes group.
      actions.place(item.task, {
        groupTag: group.tag,
        ...(source === 'calendar' ? { schedule: null } : {}),
      })
    },
    [actions, groupsById],
  )
  const drag = usePlannerDrag((taskKey) => itemsByKey.get(taskKey), onDrop)

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      aria-label="Task planner"
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
          return
        }
        if (event.key === 'ArrowLeft') {
          setWeekStart((current) => addDaysToIsoDate(current, -7))
        } else if (event.key === 'ArrowRight') {
          setWeekStart((current) => addDaysToIsoDate(current, 7))
        } else if (event.key === 't' || event.key === 'T') {
          goToToday()
        }
      }}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      <PlannerHeader
        weekStart={weekStart}
        weekEnd={addDaysToIsoDate(weekStart, 6)}
        onPrevious={() => setWeekStart((current) => addDaysToIsoDate(current, -7))}
        onNext={() => setWeekStart((current) => addDaysToIsoDate(current, 7))}
        onToday={goToToday}
      />
      {openFailed ? (
        <p role="alert" className="px-4 py-6 text-sm text-text-muted lg:px-12">
          Couldn’t load tasks.
        </p>
      ) : (
        <DndContext
          sensors={drag.sensors}
          collisionDetection={drag.collisionDetection}
          onDragStart={drag.onDragStart}
          onDragMove={drag.onDragMove}
          onDragOver={drag.onDragOver}
          onDragEnd={drag.onDragEnd}
          onDragCancel={drag.onDragCancel}
        >
          <div className="flex min-h-0 flex-1">
            <PlannerSidebar
              groups={groups}
              unscheduled={unscheduled}
              overdue={overdue}
              onToggle={onToggle}
              onOpen={onOpen}
              onAdd={onAdd}
              onColorChange={(group, color) => {
                if (group.tag !== null) {
                  setColor(group.tag, color)
                }
              }}
              onRemoveGroup={(group) => {
                if (group.tag !== null) {
                  remove(group.tag)
                }
              }}
              onCreateGroup={setColor}
            />
            <WeekGrid
              days={days}
              today={today}
              itemsByDate={itemsByDate}
              colorOf={colorOf}
              preview={drag.preview}
              registerColumn={drag.registerColumn}
              onToggle={onToggle}
              onOpen={onOpen}
              onResize={onResize}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {drag.active === null ? null : (
              <div
                style={groupColorStyle(colorOf(drag.active.groupId))}
                className={`${PLANNER_CARD_CLASS_NAME} cursor-grabbing px-2 py-1 shadow-md`}
              >
                <PlannerTaskContent item={drag.active} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
