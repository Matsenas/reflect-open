import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { addDaysToIsoDate } from '@reflect/utils'
import { formatShortDate, getUserWeekStart } from '@reflect/core'
import { routeForPath } from '@reflect/app'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation.ts'
import { useToday } from '@/lib/use-today.ts'
import { useSettings } from '@/providers/settings-provider.tsx'
import { useCoreServices } from '@/services/services-provider.tsx'
import { useServiceState } from '@/services/use-service-state.ts'
import type { DragSource } from './lib/planner-dnd.ts'
import { buildPlannerTasks, comparePlannerTasks, type PlannerTask } from './lib/planner-task.ts'
import { parseQuickAdd } from './lib/quick-add.ts'
import { INBOX_GROUP_ID, resolvePlannerGroups, type PlannerColorId } from './lib/task-group.ts'
import { formatDuration, REPEAT_LABELS } from './lib/task-meta.ts'
import { DEFAULT_DURATION_MINUTES, type TimeRange } from './lib/task-schedule.ts'
import { formatMinutes, getWeekDays } from './lib/week-layout.ts'
import { groupColorStyle, PLANNER_CARD_CLASS_NAME } from './planner-card-style.ts'
import { PlannerContext, type PlannerContextValue } from './planner-context.ts'
import { PlannerHeader } from './planner-header.tsx'
import { PlannerSidebar } from './planner-sidebar.tsx'
import { ALL_TAB } from './planner-tabs.tsx'
import { PlannerTaskContent } from './planner-task-content.tsx'
import { usePlannerActions } from './use-planner-actions.ts'
import { usePlannerDisplay } from './use-planner-display.ts'
import { usePlannerDrag, type PlannerDrop } from './use-planner-drag.ts'
import { usePlannerGroupDefinitions } from './use-planner-settings.ts'
import { WeekGrid } from './week-grid.tsx'

const RECENTLY_COMPLETED_MS = 7 * 24 * 60 * 60 * 1000
const NO_CHILDREN: readonly PlannerTask[] = []

function isTypingTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The planner: Reflect's own tasks as todos in coloured lists on the left,
 * and a week calendar on the right to drag them into.
 *
 * Nothing here is a second task store. A list is the task's first `#tag`; a
 * calendar slot is its `[[YYYY-MM-DD]]` due date plus an optional
 * `HH:MM-HH:MM` after it; a length and a repeat are `(45m)` and `(weekly)`;
 * notes and subtodos are the bullets and tasks nested under it. Every action
 * edits the task's note, so the Tasks list, the notes and this view always
 * show the same tasks.
 *
 * Keys: N new todo, ← / → change week, T today; on the todo under the pointer
 * or open in the editor, D toggles done, ⌘C copies its title, ⌫ deletes it.
 */
export function TaskPlannerScreen(): ReactElement {
  const { tasks: taskService, clock } = useCoreServices()
  const { settings } = useSettings()
  const today = useToday()
  const navigateNoteLink = useNoteLinkNavigation()
  const rootRef = useRef<HTMLDivElement>(null)
  const newTodoRef = useRef<HTMLInputElement>(null)
  const [weekStart, setWeekStart] = useState(() => getUserWeekStart(today, settings.weekStartDay))
  const days = useMemo(() => getWeekDays(weekStart), [weekStart])
  const goToToday = useCallback(() => {
    setWeekStart(getUserWeekStart(today, settings.weekStartDay))
  }, [settings.weekStartDay, today])
  const [tab, setTab] = useState(ALL_TAB)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const displayControl = usePlannerDisplay()
  const { display } = displayControl

  const { open, completed, openFailed } = useServiceState(taskService, taskService.getState)
  // Completed tasks stay on the calendar, struck, as a record of the week.
  useEffect(() => taskService.includeCompleted(), [taskService])

  const itemsByKey = useMemo(
    () => buildPlannerTasks([...(completed ?? []), ...(open ?? [])]),
    [completed, open],
  )

  const { definitions, setColor, remove } = usePlannerGroupDefinitions()
  const groups = useMemo(() => {
    const groupIds = [...itemsByKey.values()]
      .filter((item) => !item.task.checked)
      .map((item) => item.groupId)
    return resolvePlannerGroups(definitions, groupIds)
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

  // What the todo list shows, split into top-level rows per list and subtodos
  // per parent. A subtodo whose parent is not shown is listed on its own.
  const { listed, children, counts, total } = useMemo(() => {
    const recentlyDone = clock.now() - RECENTLY_COMPLETED_MS
    const visible = new Map<string, PlannerTask>()
    for (const item of itemsByKey.values()) {
      const shown = item.task.checked
        ? display.completed && item.task.updatedAt >= recentlyDone
        : display.scheduled || item.schedule === null
      if (shown) {
        visible.set(item.key, item)
      }
    }
    const topLevel = new Map<string, PlannerTask[]>()
    const nested = new Map<string, PlannerTask[]>()
    const openCounts = new Map<string, number>()
    let openTotal = 0
    for (const item of visible.values()) {
      const parentKey =
        item.parentKey !== null && visible.has(item.parentKey) ? item.parentKey : null
      const bucket = parentKey === null ? topLevel : nested
      const bucketKey = parentKey ?? item.groupId
      bucket.set(bucketKey, [...(bucket.get(bucketKey) ?? []), item])
      if (!item.task.checked) {
        openCounts.set(item.groupId, (openCounts.get(item.groupId) ?? 0) + 1)
        openTotal += 1
      }
    }
    return { listed: topLevel, children: nested, counts: openCounts, total: openTotal }
  }, [clock, display.completed, display.scheduled, itemsByKey])

  const actions = usePlannerActions(today)
  const openNote = useCallback(
    (item: PlannerTask, openInNewWindow: boolean) => {
      navigateNoteLink({ target: routeForPath(item.task.notePath), openInNewWindow })
    },
    [navigateNoteLink],
  )
  const describe = useCallback(
    (item: PlannerTask): string | null => {
      const parts: string[] = []
      if (item.schedule !== null) {
        const { date, time } = item.schedule
        const day = date === today ? 'Today' : formatShortDate(date, settings.dateFormat)
        parts.push(
          time === null
            ? day
            : `${day} ${formatMinutes(time.start, settings.timeFormat)} – ${formatMinutes(time.end, settings.timeFormat)}`,
        )
      } else if (item.duration !== DEFAULT_DURATION_MINUTES) {
        parts.push(formatDuration(item.duration))
      }
      if (item.repeat !== null) {
        parts.push(REPEAT_LABELS[item.repeat])
      }
      return parts.length === 0 ? null : parts.join(' · ')
    },
    [settings.dateFormat, settings.timeFormat, today],
  )
  const planner = useMemo<PlannerContextValue>(
    () => ({
      groups,
      colorOf,
      childrenOf: (taskKey) => children.get(taskKey) ?? NO_CHILDREN,
      actions,
      today,
      expandedKey,
      setExpandedKey,
      setHoveredKey,
      describe,
      openNote,
    }),
    [actions, children, colorOf, describe, expandedKey, groups, openNote, today],
  )

  const onToggle = useCallback((item: PlannerTask) => actions.toggle(item), [actions])
  const onResize = useCallback(
    (item: PlannerTask, time: TimeRange) => {
      if (item.schedule !== null) {
        actions.place(item, { schedule: { date: item.schedule.date, time } })
      }
    },
    [actions],
  )
  const onAdd = useCallback(
    (input: string) => {
      const { text, group } = parseQuickAdd(input, groups)
      const target = group ?? groupsById.get(tab === ALL_TAB ? INBOX_GROUP_ID : tab)
      if (text !== '') {
        actions.add(text, target?.tag ?? null)
      }
    },
    [actions, groups, groupsById, tab],
  )
  const onDrop = useCallback(
    (item: PlannerTask, source: DragSource, drop: PlannerDrop) => {
      if (drop.kind === 'schedule') {
        actions.place(item, { schedule: drop.schedule })
        return
      }
      const group = groupsById.get(drop.groupId)
      if (group === undefined) {
        return
      }
      // A card dragged off the calendar into the list is unscheduled too; a
      // row moved within the list only changes list.
      actions.place(item, {
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

  const activeItem = itemsByKey.get(hoveredKey ?? expandedKey ?? '')
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      aria-label="Planner"
      onKeyDown={(event) => {
        if (event.altKey || isTypingTarget(event.target)) {
          return
        }
        const key = event.key.toLowerCase()
        if (event.metaKey || event.ctrlKey) {
          const hasSelection = (window.getSelection()?.toString() ?? '') !== ''
          if (key === 'c' && activeItem !== undefined && !hasSelection) {
            event.preventDefault()
            actions.copyTitle(activeItem)
          }
          return
        }
        if (key === 'arrowleft') {
          setWeekStart((current) => addDaysToIsoDate(current, -7))
        } else if (key === 'arrowright') {
          setWeekStart((current) => addDaysToIsoDate(current, 7))
        } else if (key === 't') {
          goToToday()
        } else if (key === 'n') {
          event.preventDefault()
          newTodoRef.current?.focus()
        } else if (key === 'd' && activeItem !== undefined) {
          actions.toggle(activeItem)
        } else if ((key === 'backspace' || key === 'delete') && activeItem !== undefined) {
          actions.remove(activeItem)
          setHoveredKey(null)
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
        <PlannerContext value={planner}>
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
                listed={listed}
                counts={counts}
                total={total}
                tab={groupsById.has(tab) ? tab : ALL_TAB}
                onTabChange={setTab}
                displayControl={displayControl}
                newTodoRef={newTodoRef}
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
                onOpen={openNote}
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
        </PlannerContext>
      )}
    </div>
  )
}
