import type { ReactElement } from 'react'
import type { TimeRange } from './lib/task-schedule.ts'
import { formatMinutes, minutesToOffset, type BlockLane } from './lib/week-layout.ts'

interface CalendarEventBlockProps {
  title: string
  time: TimeRange
  lane: BlockLane
  timeFormat: '12h' | '24h'
  /**
   * The source calendar's colour as `#rrggbb`, drawn as the left edge.
   */
  color?: string | null
}

/**
 * A meeting from Apple or Google Calendar on the week grid: read-only context to plan
 * tasks around, so it stays neutral and takes no pointer events.
 */
export function CalendarEventBlock({
  title,
  time,
  lane,
  timeFormat,
  color = null,
}: CalendarEventBlockProps): ReactElement {
  const height = Math.max(minutesToOffset(time.end - time.start) - 2, 18)
  return (
    <div
      style={{
        top: minutesToOffset(time.start) + 1,
        height,
        left: `calc(${(lane.column / lane.columns) * 100}% + 2px)`,
        width: `calc(${100 / lane.columns}% - 4px)`,
        ...(color === null ? {} : { borderLeftColor: color, borderLeftWidth: 3 }),
      }}
      className="pointer-events-none absolute overflow-hidden rounded-md border border-border-strong bg-surface-sunken px-1.5 py-0.5 text-xs leading-5 text-text-secondary"
    >
      <div className="truncate font-medium">{title}</div>
      {height >= 40 ? (
        <div className="truncate text-[11px] leading-4 tabular-nums text-text-muted">
          {formatMinutes(time.start, timeFormat)} – {formatMinutes(time.end, timeFormat)}
        </div>
      ) : null}
    </div>
  )
}
