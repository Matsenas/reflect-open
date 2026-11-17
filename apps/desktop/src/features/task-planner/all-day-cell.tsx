import type { ReactElement } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useDayEvents } from '@/lib/use-calendar.ts'
import { cn } from '@/lib/utils.ts'
import type { GoogleCalendarEvent } from '../google-calendar/lib/google-events.ts'
import { dragId, type DropTarget } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId } from './lib/task-group.ts'
import { rangeOnDay } from './lib/week-layout.ts'
import { groupColorStyle, PLANNER_CARD_CLASS_NAME } from './planner-card-style.ts'
import { PlannerTaskContent } from './planner-task-content.tsx'

interface AllDayChipProps {
  item: PlannerTask
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
}

function AllDayChip({ item, onToggle, onOpen }: AllDayChipProps): ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId('calendar', item.key),
    disabled: item.task.checked,
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDoubleClick={(event) => onOpen(item, event.metaKey || event.ctrlKey)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          onOpen(item, event.metaKey || event.ctrlKey)
        }
        listeners?.onKeyDown?.(event)
      }}
      title={item.task.noteTitle}
      className={cn(
        PLANNER_CARD_CLASS_NAME,
        'touch-none px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        item.task.checked ? 'cursor-default' : 'cursor-grab',
        isDragging && 'opacity-40',
      )}
    >
      <PlannerTaskContent item={item} onToggle={() => onToggle(item)} />
    </div>
  )
}

interface AllDayCellProps {
  date: string
  /**
   * The day's tasks that have a date but no time.
   */
  items: readonly PlannerTask[]
  /**
   * The shown week's Google Calendar events; the cell picks its own day's.
   */
  googleEvents: readonly GoogleCalendarEvent[]
  colorOf: (groupId: string) => PlannerColorId
  /**
   * Whether the task being dragged would land here.
   */
  isPreview: boolean
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
}

/**
 * A day's all-day lane: tasks due that day without a time, and the day's
 * all-day Apple and Google Calendar events. Dropping a task here gives it just the date,
 * which is exactly Reflect's own due date.
 */
export function AllDayCell({
  date,
  items,
  googleEvents,
  colorOf,
  isPreview,
  onToggle,
  onOpen,
}: AllDayCellProps): ReactElement {
  const data: DropTarget = { kind: 'allDay', date }
  const { setNodeRef } = useDroppable({ id: `allDay:${date}`, data })
  const events = useDayEvents(date).filter((event) => event.allDay)
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-8 flex-col gap-0.5 border-l border-border p-0.5',
        isPreview && 'bg-accent/10',
      )}
    >
      {events.map((event) => (
        <div
          key={`${event.id}:${event.startsAt}`}
          className="truncate rounded-md border border-border-strong bg-surface-sunken px-1.5 text-xs leading-5 font-medium text-text-secondary"
        >
          {event.title}
        </div>
      ))}
      {googleEvents
        .filter((event) => {
          return event.allDay && rangeOnDay(event.startsAt, event.endsAt, date) !== null
        })
        .map((event) => (
          <div
            key={event.id}
            style={
              event.color === null
                ? undefined
                : { borderLeftColor: event.color, borderLeftWidth: 3 }
            }
            className="truncate rounded-md border border-border-strong bg-surface-sunken px-1.5 text-xs leading-5 font-medium text-text-secondary"
          >
            {event.title}
          </div>
        ))}
      {items.map((item) => (
        <div key={item.key} style={groupColorStyle(colorOf(item.groupId))}>
          <AllDayChip item={item} onToggle={onToggle} onOpen={onOpen} />
        </div>
      ))}
    </div>
  )
}
