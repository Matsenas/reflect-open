import { useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { cn } from '@/lib/utils.ts'
import type { TimeRange } from '../task-planner/lib/task-schedule.ts'
import {
  formatMinutes,
  HOUR_HEIGHT,
  minutesToOffset,
  rangeAtOffset,
  resizeToOffset,
  type BlockLane,
} from '../task-planner/lib/week-layout.ts'

interface GoogleEventBlockProps {
  title: string
  /** The event's block on this day, in minutes of the day. */
  time: TimeRange
  lane: BlockLane
  timeFormat: '12h' | '24h'
  /** The calendar's colour as `#rrggbb`, drawn as the left edge. */
  color: string | null
  /** Whether the block can be dragged to another slot and resized. */
  editable: boolean
  /** The block was dropped on `date` at `time`, or resized to it. */
  onChange: (date: string, time: TimeRange) => void
}

interface Press {
  readonly mode: 'move' | 'resize'
  readonly x: number
  readonly y: number
}

interface Gesture {
  readonly date: string
  readonly time: TimeRange
  /** How far the target day column is from this one, in pixels. */
  readonly shiftX: number
}

const MIN_BLOCK_HEIGHT = 18
/** Pointer travel before a press becomes a move, so a click stays a click. */
const DRAG_THRESHOLD = 4

function columnOf(element: Element): HTMLElement | null {
  const column = element.closest('[data-planner-column]')
  return column instanceof HTMLElement ? column : null
}

function columnAt(x: number, y: number): HTMLElement | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element instanceof HTMLElement && element.dataset['plannerColumn'] !== undefined) {
      return element
    }
  }
  return null
}

/**
 * A Google Calendar event on the week grid. When editable, drag the block to
 * another slot or day, or drag its bottom edge to change its length; either
 * one updates the event in Google Calendar.
 */
export function GoogleEventBlock({
  title,
  time,
  lane,
  timeFormat,
  color,
  editable,
  onChange,
}: GoogleEventBlockProps): ReactElement {
  const pressRef = useRef<Press | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const shown = gesture?.time ?? time

  const startPress = (event: PointerEvent<HTMLDivElement>, mode: Press['mode']): void => {
    if (!editable || event.button !== 0) {
      return
    }
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    pressRef.current = { mode, x: event.clientX, y: event.clientY }
  }

  const track = (event: PointerEvent<HTMLDivElement>): void => {
    const press = pressRef.current
    const home = columnOf(event.currentTarget)
    const homeDate = home?.dataset['plannerColumn']
    if (press === null || home === null || homeDate === undefined) {
      return
    }
    if (press.mode === 'resize') {
      const offset = event.clientY - home.getBoundingClientRect().top
      setGesture({ date: homeDate, time: resizeToOffset(time, offset), shiftX: 0 })
      return
    }
    const travel = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (gesture === null && travel < DRAG_THRESHOLD) {
      return
    }
    const target = columnAt(event.clientX, event.clientY) ?? home
    const movedMinutes = ((event.clientY - press.y) / HOUR_HEIGHT) * 60
    setGesture({
      date: target.dataset['plannerColumn'] ?? homeDate,
      time: rangeAtOffset(minutesToOffset(time.start + movedMinutes), time.end - time.start),
      shiftX: target.getBoundingClientRect().left - home.getBoundingClientRect().left,
    })
  }

  const finish = (commit: boolean): void => {
    const press = pressRef.current
    pressRef.current = null
    setGesture(null)
    if (!commit || press === null || gesture === null) {
      return
    }
    const moved =
      gesture.shiftX !== 0 || gesture.time.start !== time.start || gesture.time.end !== time.end
    if (moved) {
      onChange(gesture.date, gesture.time)
    }
  }

  const height = Math.max(minutesToOffset(shown.end - shown.start) - 2, MIN_BLOCK_HEIGHT)
  const moving = gesture !== null
  return (
    <div
      onPointerDown={(event) => startPress(event, 'move')}
      onPointerMove={track}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      title={title}
      style={{
        top: minutesToOffset(shown.start) + 1,
        height,
        // A block being moved takes its target column's full width.
        left: moving ? 2 : `calc(${(lane.column / lane.columns) * 100}% + 2px)`,
        width: moving ? 'calc(100% - 4px)' : `calc(${100 / lane.columns}% - 4px)`,
        transform: moving ? `translateX(${gesture.shiftX}px)` : undefined,
        ...(color === null ? {} : { borderLeftColor: color, borderLeftWidth: 3 }),
      }}
      className={cn(
        'absolute touch-none overflow-hidden rounded-md border border-border-strong bg-surface-sunken px-1.5 py-0.5 text-xs leading-5 text-text-secondary select-none',
        editable ? 'cursor-grab' : 'pointer-events-none',
        moving && 'z-30 cursor-grabbing shadow-md',
      )}
    >
      <div className="truncate font-medium">{title}</div>
      {height >= 40 ? (
        <div className="truncate text-[11px] leading-4 tabular-nums text-text-muted">
          {formatMinutes(shown.start, timeFormat)} – {formatMinutes(shown.end, timeFormat)}
        </div>
      ) : null}
      {editable ? (
        <div
          aria-hidden
          onPointerDown={(event) => startPress(event, 'resize')}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      ) : null}
    </div>
  )
}
