import { useState, type PointerEvent, type ReactElement } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils.ts'
import { dragId } from './lib/planner-dnd.ts'
import type { PlannerTask } from './lib/planner-task.ts'
import type { TimeRange } from './lib/task-schedule.ts'
import {
  formatMinutes,
  minutesToOffset,
  resizeToOffset,
  type BlockLane,
} from './lib/week-layout.ts'
import { PLANNER_CARD_CLASS_NAME } from './planner-card-style.ts'
import { PlannerTaskContent } from './planner-task-content.tsx'

interface CalendarTaskBlockProps {
  item: PlannerTask
  time: TimeRange
  lane: BlockLane
  timeFormat: '12h' | '24h'
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
  onResize: (item: PlannerTask, time: TimeRange) => void
}

const MIN_BLOCK_HEIGHT = 22

/**
 * A timed task on the week grid. Drag the block to move it, drag its bottom
 * edge to change how long it takes; a completed task stays put, struck.
 */
export function CalendarTaskBlock({
  item,
  time,
  lane,
  timeFormat,
  onToggle,
  onOpen,
  onResize,
}: CalendarTaskBlockProps): ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId('calendar', item.key),
    disabled: item.task.checked,
  })
  const [resized, setResized] = useState<TimeRange | null>(null)
  const shown = resized ?? time

  const resizeTo = (event: PointerEvent<HTMLDivElement>): TimeRange | null => {
    const column = event.currentTarget.closest('[data-planner-column]')
    if (column === null) {
      return null
    }
    return resizeToOffset(time, event.clientY - column.getBoundingClientRect().top)
  }

  const height = Math.max(minutesToOffset(shown.end - shown.start) - 2, MIN_BLOCK_HEIGHT)
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
      style={{
        top: minutesToOffset(shown.start) + 1,
        height,
        left: `calc(${(lane.column / lane.columns) * 100}% + 2px)`,
        width: `calc(${100 / lane.columns}% - 4px)`,
      }}
      className={cn(
        PLANNER_CARD_CLASS_NAME,
        'absolute z-10 touch-none overflow-hidden px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        item.task.checked ? 'cursor-default' : 'cursor-grab',
        isDragging && 'opacity-40',
        resized !== null && 'z-20 shadow-md',
      )}
    >
      <PlannerTaskContent
        item={item}
        detail={
          height >= 40
            ? `${formatMinutes(shown.start, timeFormat)} – ${formatMinutes(shown.end, timeFormat)}`
            : null
        }
        onToggle={() => onToggle(item)}
      />
      {item.task.checked ? null : (
        <div
          aria-hidden
          onPointerDown={(event) => {
            // Keep the press from starting a move of the whole block.
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            setResized(time)
          }}
          onPointerMove={(event) => {
            if (resized !== null) {
              setResized(resizeTo(event) ?? resized)
            }
          }}
          onPointerUp={(event) => {
            const next = resizeTo(event)
            setResized(null)
            if (next !== null && next.end !== time.end) {
              onResize(item, next)
            }
          }}
          onPointerCancel={() => setResized(null)}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </div>
  )
}
