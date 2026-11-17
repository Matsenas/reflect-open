import { useCallback, useRef, useState } from 'react'
import {
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core'
import { dropTargetSchema, parseDragId, type DragSource } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { TaskSchedule } from './lib/task-schedule.ts'
import { rangeAtOffset } from './lib/week-layout.ts'

/**
 * Where a drag ends: a slot on the calendar, or a group in the task list.
 */
export type PlannerDrop =
  | { readonly kind: 'schedule'; readonly schedule: TaskSchedule }
  | { readonly kind: 'group'; readonly groupId: string }

export interface PlannerDrag {
  readonly sensors: SensorDescriptor<SensorOptions>[]
  readonly collisionDetection: CollisionDetection
  /**
   * The task being dragged, for the drag overlay.
   */
  readonly active: PlannerTask | null
  /**
   * The slot the dragged task would take if dropped now.
   */
  readonly preview: TaskSchedule | null
  /**
   * Day columns report their element so a drop can be measured against it.
   */
  readonly registerColumn: (date: string, element: HTMLElement | null) => void
  readonly onDragStart: (event: DragStartEvent) => void
  readonly onDragMove: (event: DragMoveEvent) => void
  readonly onDragOver: (event: DragOverEvent) => void
  readonly onDragEnd: (event: DragEndEvent) => void
  readonly onDragCancel: () => void
}

// The sticky all-day lane sits on top of the scrolling grid, so the pointer
// can be inside both; the grid is the fallback, never the winner.
const preferSmallTargets: CollisionDetection = (args) => {
  const collisions = pointerWithin(args)
  const specific = collisions.filter((collision) => !String(collision.id).startsWith('grid:'))
  return specific.length > 0 ? specific : collisions
}

function isSameSchedule(left: TaskSchedule | null, right: TaskSchedule | null): boolean {
  if (left === null || right === null) {
    return left === right
  }
  return (
    left.date === right.date &&
    left.time?.start === right.time?.start &&
    left.time?.end === right.time?.end
  )
}

/**
 * The planner's drag-and-drop: resolves the dragged task, turns the pointer's
 * place over a day column into a snapped time block, and reports the drop.
 */
export function usePlannerDrag(
  findTask: (taskKey: string) => PlannerTask | undefined,
  onDrop: (item: PlannerTask, source: DragSource, drop: PlannerDrop) => void,
): PlannerDrag {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const columnsRef = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState<PlannerTask | null>(null)
  const [preview, setPreview] = useState<TaskSchedule | null>(null)

  const registerColumn = useCallback((date: string, element: HTMLElement | null) => {
    if (element === null) {
      columnsRef.current.delete(date)
    } else {
      columnsRef.current.set(date, element)
    }
  }, [])

  const resolveDrop = useCallback(
    (item: PlannerTask, dragged: Active, over: Over | null): PlannerDrop | null => {
      const target = dropTargetSchema.safeParse(over?.data.current)
      if (!target.success) {
        return null
      }
      if (target.data.kind === 'group') {
        return { kind: 'group', groupId: target.data.groupId }
      }
      const { date } = target.data
      if (target.data.kind === 'allDay') {
        return { kind: 'schedule', schedule: { date, time: null } }
      }
      const column = columnsRef.current.get(date)
      const top = dragged.rect.current.translated?.top
      if (column === undefined || top === undefined) {
        return null
      }
      const offset = top - column.getBoundingClientRect().top
      const time = rangeAtOffset(offset, item.duration)
      return { kind: 'schedule', schedule: { date, time } }
    },
    [],
  )

  const reset = useCallback(() => {
    setActive(null)
    setPreview(null)
  }, [])

  const updatePreview = (event: DragMoveEvent | DragOverEvent): void => {
    const drop = active === null ? null : resolveDrop(active, event.active, event.over)
    const next = drop?.kind === 'schedule' ? drop.schedule : null
    setPreview((current) => (isSameSchedule(current, next) ? current : next))
  }

  return {
    sensors,
    collisionDetection: preferSmallTargets,
    active,
    preview,
    registerColumn,
    onDragStart: (event) => {
      const parsed = parseDragId(event.active.id)
      setActive(parsed === null ? null : (findTask(parsed.taskKey) ?? null))
    },
    onDragMove: updatePreview,
    // `over` changes after the move that caused it, so follow both events.
    onDragOver: updatePreview,
    onDragEnd: (event) => {
      const parsed = parseDragId(event.active.id)
      const drop = active === null ? null : resolveDrop(active, event.active, event.over)
      if (active !== null && parsed !== null && drop !== null) {
        onDrop(active, parsed.source, drop)
      }
      reset()
    },
    onDragCancel: reset,
  }
}
