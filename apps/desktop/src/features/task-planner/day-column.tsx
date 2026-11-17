import { useCallback, useMemo, type ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDayEvents } from '@/lib/use-calendar.ts'
import { cn } from '@/lib/utils.ts'
import type { GoogleCalendarEvent } from '../google-calendar/lib/google-events.ts'
import { CalendarEventBlock } from './calendar-event-block.tsx'
import { CalendarTaskBlock } from './calendar-task-block.tsx'
import type { DropTarget } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId } from './lib/task-group.ts'
import type { TimeRange } from './lib/task-schedule.ts'
import {
  HOUR_HEIGHT,
  layoutDayBlocks,
  minutesToOffset,
  rangeOnDay,
  type DayBlock,
} from './lib/week-layout.ts'
import { groupColorStyle } from './planner-card-style.ts'

interface DayColumnProps {
  date: string
  /**
   * The current minute when this column is today, else null.
   */
  nowMinutes: number | null
  /**
   * The day's tasks that have a time.
   */
  items: readonly PlannerTask[]
  /**
   * The shown week's Google Calendar events; the column picks its own day's.
   */
  googleEvents: readonly GoogleCalendarEvent[]
  colorOf: (groupId: string) => PlannerColorId
  /**
   * Where the task being dragged would land in this column, if here.
   */
  preview: TimeRange | null
  timeFormat: '12h' | '24h'
  registerColumn: (date: string, element: HTMLElement | null) => void
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
  onResize: (item: PlannerTask, time: TimeRange) => void
}

const HOUR_LINES = `linear-gradient(to bottom, var(--border) 1px, transparent 1px)`

/**
 * One day of the week grid: 24 hours tall, a drop zone for tasks, showing the
 * day's timed tasks and Apple and Google Calendar meetings side by side where they
 * overlap.
 */
export function DayColumn({
  date,
  nowMinutes,
  items,
  googleEvents,
  colorOf,
  preview,
  timeFormat,
  registerColumn,
  onToggle,
  onOpen,
  onResize,
}: DayColumnProps): ReactElement {
  const data: DropTarget = { kind: 'grid', date }
  const { setNodeRef } = useDroppable({ id: `grid:${date}`, data })
  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      setNodeRef(element)
      registerColumn(date, element)
    },
    [date, registerColumn, setNodeRef],
  )

  const dayEvents = useDayEvents(date)
  const events = useMemo(() => {
    const apple = dayEvents.flatMap((event) => {
      const time = event.allDay ? null : rangeOnDay(event.startsAt, event.endsAt, date)
      return time === null
        ? []
        : { id: `event:${event.id}:${event.startsAt}`, title: event.title, time, color: null }
    })
    // A Google account added to macOS as well arrives through both sources.
    const shown = new Set(
      apple.map((event) => `${event.title}:${event.time.start}:${event.time.end}`),
    )
    const google = googleEvents.flatMap((event) => {
      const time = event.allDay ? null : rangeOnDay(event.startsAt, event.endsAt, date)
      return time === null || shown.has(`${event.title}:${time.start}:${time.end}`)
        ? []
        : { id: `google:${event.id}`, title: event.title, time, color: event.color }
    })
    return [...apple, ...google]
  }, [date, dayEvents, googleEvents])
  const lanes = useMemo(() => {
    const blocks: DayBlock[] = events.map((event) => ({ id: event.id, ...event.time }))
    for (const item of items) {
      const time = item.schedule?.time
      if (time !== null && time !== undefined) {
        blocks.push({ id: item.key, ...time })
      }
    }
    return layoutDayBlocks(blocks)
  }, [events, items])
  const fullLane = { column: 0, columns: 1 }

  return (
    <div
      ref={setRefs}
      data-planner-column={date}
      style={{
        height: HOUR_HEIGHT * 24,
        backgroundImage: HOUR_LINES,
        backgroundSize: `100% ${HOUR_HEIGHT}px`,
      }}
      className={cn('relative border-l border-border', nowMinutes !== null && 'bg-accent/[0.03]')}
    >
      {events.map((event) => (
        <CalendarEventBlock
          key={event.id}
          title={event.title}
          time={event.time}
          lane={lanes.get(event.id) ?? fullLane}
          timeFormat={timeFormat}
          color={event.color}
        />
      ))}
      {items.map((item) => {
        const time = item.schedule?.time
        return time === null || time === undefined ? null : (
          <div key={item.key} style={groupColorStyle(colorOf(item.groupId))} className="contents">
            <CalendarTaskBlock
              item={item}
              time={time}
              lane={lanes.get(item.key) ?? fullLane}
              timeFormat={timeFormat}
              onToggle={onToggle}
              onOpen={onOpen}
              onResize={onResize}
            />
          </div>
        )
      })}
      {preview === null ? null : (
        <div
          aria-hidden
          style={{
            top: minutesToOffset(preview.start) + 1,
            height: Math.max(minutesToOffset(preview.end - preview.start) - 2, 12),
          }}
          className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md border border-dashed border-accent bg-accent/10"
        />
      )}
      {nowMinutes === null ? null : (
        <div
          aria-hidden
          style={{ top: minutesToOffset(nowMinutes) }}
          className="pointer-events-none absolute inset-x-0 z-30 h-px bg-red-500 before:absolute before:-left-1 before:-top-[3px] before:size-[7px] before:rounded-full before:bg-red-500"
        />
      )}
    </div>
  )
}
