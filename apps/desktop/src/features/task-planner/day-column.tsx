import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDayEvents } from '@/lib/use-calendar.ts'
import { cn } from '@/lib/utils.ts'
import { GoogleEventBlock } from '../google-calendar/google-event-block.tsx'
import { timeOnDay, type GoogleCalendarEvent } from '../google-calendar/lib/google-events.ts'
import { NewGoogleEventDraft } from '../google-calendar/new-google-event-draft.tsx'
import { useGoogleEventActions } from '../google-calendar/use-google-event-actions.ts'
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
  newEventRangeAtOffset,
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
 * overlap. Google events can be dragged and resized, and double-clicking an
 * empty slot starts a new one.
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
  const googleActions = useGoogleEventActions()
  const [draft, setDraft] = useState<TimeRange | null>(null)
  const googleBlocks = useMemo(() => {
    return googleEvents.flatMap((event) => {
      const time = event.allDay ? null : rangeOnDay(event.startsAt, event.endsAt, date)
      if (time === null) {
        return []
      }
      // An event that runs past midnight shows clipped; moving a clipped
      // block would silently change its length.
      const whole = event.endsAt - event.startsAt === (time.end - time.start) * 60_000
      return { id: `google:${event.id}`, event, time, movable: event.editable && whole }
    })
  }, [date, googleEvents])
  const events = useMemo(() => {
    // A Google account added to macOS as well arrives through both sources;
    // the Google copy is the one that can be moved, so it is the one kept.
    const shown = new Set(
      googleBlocks.map((block) => `${block.event.title}:${block.time.start}:${block.time.end}`),
    )
    return dayEvents.flatMap((event) => {
      const time = event.allDay ? null : rangeOnDay(event.startsAt, event.endsAt, date)
      return time === null || shown.has(`${event.title}:${time.start}:${time.end}`)
        ? []
        : { id: `event:${event.id}:${event.startsAt}`, title: event.title, time }
    })
  }, [date, dayEvents, googleBlocks])
  const lanes = useMemo(() => {
    const blocks: DayBlock[] = events.map((event) => ({ id: event.id, ...event.time }))
    for (const block of googleBlocks) {
      blocks.push({ id: block.id, ...block.time })
    }
    for (const item of items) {
      const time = item.schedule?.time
      if (time !== null && time !== undefined) {
        blocks.push({ id: item.key, ...time })
      }
    }
    return layoutDayBlocks(blocks)
  }, [events, googleBlocks, items])
  const fullLane = { column: 0, columns: 1 }

  return (
    <div
      ref={setRefs}
      data-planner-column={date}
      onDoubleClick={(event) => {
        // Only an empty slot starts a new event, never a block in it.
        if (!googleActions.canWrite || event.target !== event.currentTarget) {
          return
        }
        const offset = event.clientY - event.currentTarget.getBoundingClientRect().top
        setDraft(newEventRangeAtOffset(offset))
      }}
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
        />
      ))}
      {googleBlocks.map((block) => (
        <GoogleEventBlock
          key={block.id}
          title={block.event.title}
          time={block.time}
          lane={lanes.get(block.id) ?? fullLane}
          timeFormat={timeFormat}
          color={block.event.color}
          editable={googleActions.canWrite && block.movable}
          onChange={(targetDate, time) => {
            googleActions.move(block.event, {
              start: timeOnDay(targetDate, time.start),
              end: timeOnDay(targetDate, time.end),
            })
          }}
        />
      ))}
      {draft === null ? null : (
        <NewGoogleEventDraft
          time={draft}
          timeFormat={timeFormat}
          onCancel={() => setDraft(null)}
          onSubmit={(title) => {
            googleActions.create(title, {
              start: timeOnDay(date, draft.start),
              end: timeOnDay(date, draft.end),
            })
            setDraft(null)
          }}
        />
      )}
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
