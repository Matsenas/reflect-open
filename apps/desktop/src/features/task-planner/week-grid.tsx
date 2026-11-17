import { useLayoutEffect, useRef, type ReactElement } from 'react'
import { formatDate } from '@reflect/utils'
import { useCalendarChangeInvalidation } from '@/lib/use-calendar.ts'
import { InlineAlert } from '@/components/inline-alert.tsx'
import { cn } from '@/lib/utils.ts'
import { useSettings } from '@/providers/settings-provider.tsx'
import { useGoogleEvents } from '../google-calendar/use-google-calendar.ts'
import { AllDayCell } from './all-day-cell.tsx'
import { DayColumn } from './day-column.tsx'
import type { PlannerTask } from './lib/planner-task.ts'
import type { PlannerColorId } from './lib/task-group.ts'
import type { TaskSchedule, TimeRange } from './lib/task-schedule.ts'
import { formatMinutes, HOUR_HEIGHT, minutesToOffset } from './lib/week-layout.ts'
import { useNowMinutes } from './use-now-minutes.ts'

interface WeekGridProps {
  days: readonly string[]
  today: string
  /**
   * Scheduled tasks (open and completed) by their date.
   */
  itemsByDate: ReadonlyMap<string, readonly PlannerTask[]>
  colorOf: (groupId: string) => PlannerColorId
  /**
   * Where the task being dragged would land, while it is over the calendar.
   */
  preview: TaskSchedule | null
  registerColumn: (date: string, element: HTMLElement | null) => void
  onToggle: (item: PlannerTask) => void
  onOpen: (item: PlannerTask, openInNewWindow: boolean) => void
  onResize: (item: PlannerTask, time: TimeRange) => void
}

const GRID_COLUMNS = 'grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]'
const HOURS = Array.from({ length: 23 }, (_, index) => index + 1)
const NO_ITEMS: readonly PlannerTask[] = []

/**
 * The week calendar: day headers and the all-day lane pinned on top, the
 * 24-hour grid scrolling beneath. It opens scrolled to just before now.
 */
export function WeekGrid({
  days,
  today,
  itemsByDate,
  colorOf,
  preview,
  registerColumn,
  onToggle,
  onOpen,
  onResize,
}: WeekGridProps): ReactElement {
  const { settings } = useSettings()
  useCalendarChangeInvalidation(settings.calendarEnabled)
  const google = useGoogleEvents(days)
  const nowMinutes = useNowMinutes()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const firstNowRef = useRef(nowMinutes)
  useLayoutEffect(() => {
    scrollerRef.current?.scrollTo({ top: minutesToOffset(Math.max(firstNowRef.current - 120, 0)) })
  }, [])

  return (
    <div ref={scrollerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-40 border-b border-border bg-surface">
        {google.error === null ? null : (
          <InlineAlert tone="warning" className="m-2">
            Couldn’t load Google Calendar events. {google.error}
          </InlineAlert>
        )}
        <div className={GRID_COLUMNS}>
          <div />
          {days.map((date) => (
            <div
              key={date}
              aria-current={date === today ? 'date' : undefined}
              className="flex items-center justify-center gap-1.5 border-l border-border py-1.5 text-xs text-text-muted"
            >
              {formatDate(date, 'EEE')}
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-md font-medium tabular-nums text-text',
                  date === today && 'bg-surface-inverse font-bold text-text-on-inverse',
                )}
              >
                {formatDate(date, 'd')}
              </span>
            </div>
          ))}
        </div>
        <div className={GRID_COLUMNS}>
          <div className="pr-1.5 pt-1.5 text-right text-2xs text-text-muted">All day</div>
          {days.map((date) => (
            <AllDayCell
              key={date}
              date={date}
              items={(itemsByDate.get(date) ?? NO_ITEMS).filter(
                (item) => item.schedule?.time === null,
              )}
              googleEvents={google.events}
              colorOf={colorOf}
              isPreview={preview !== null && preview.date === date && preview.time === null}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
      <div className={GRID_COLUMNS}>
        <div aria-hidden className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{ top: hour * HOUR_HEIGHT }}
              className="absolute right-1.5 -translate-y-1/2 text-2xs tabular-nums text-text-muted"
            >
              {formatMinutes(hour * 60, settings.timeFormat)}
            </div>
          ))}
        </div>
        {days.map((date) => (
          <DayColumn
            key={date}
            date={date}
            nowMinutes={date === today ? nowMinutes : null}
            items={(itemsByDate.get(date) ?? NO_ITEMS).filter(
              (item) => item.schedule?.time !== null,
            )}
            googleEvents={google.events}
            colorOf={colorOf}
            preview={preview !== null && preview.date === date ? preview.time : null}
            timeFormat={settings.timeFormat}
            registerColumn={registerColumn}
            onToggle={onToggle}
            onOpen={onOpen}
            onResize={onResize}
          />
        ))}
      </div>
    </div>
  )
}
