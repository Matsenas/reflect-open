import { useState, type ReactElement } from 'react'
import type { TimeRange } from '../task-planner/lib/task-schedule.ts'
import { formatMinutes, minutesToOffset } from '../task-planner/lib/week-layout.ts'

interface NewGoogleEventDraftProps {
  /** The slot the new event will take. */
  time: TimeRange
  timeFormat: '12h' | '24h'
  /** Enter was pressed with a title. */
  onSubmit: (title: string) => void
  /** Escape was pressed, or the field lost focus. */
  onCancel: () => void
}

/**
 * The block shown where a new Google Calendar event is being typed: Enter
 * creates it, Escape or clicking away drops it.
 */
export function NewGoogleEventDraft({
  time,
  timeFormat,
  onSubmit,
  onCancel,
}: NewGoogleEventDraftProps): ReactElement {
  const [title, setTitle] = useState('')
  return (
    <div
      style={{
        top: minutesToOffset(time.start) + 1,
        height: minutesToOffset(time.end - time.start) - 2,
      }}
      className="absolute inset-x-0.5 z-30 overflow-hidden rounded-md border border-accent bg-surface px-1.5 py-0.5 text-xs leading-5 shadow-md"
    >
      <input
        autoFocus
        value={title}
        aria-label="New Google Calendar event"
        placeholder="New event"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={onCancel}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            onCancel()
          } else if (event.key === 'Enter' && title.trim() !== '') {
            onSubmit(title.trim())
          }
        }}
        className="w-full bg-transparent font-medium text-text outline-none placeholder:text-text-muted"
      />
      <div className="truncate text-[11px] leading-4 tabular-nums text-text-muted">
        {formatMinutes(time.start, timeFormat)} – {formatMinutes(time.end, timeFormat)}
      </div>
    </div>
  )
}
