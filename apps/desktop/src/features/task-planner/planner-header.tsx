import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@reflect/utils'
import { Button } from '@/components/ui/button.tsx'

interface PlannerHeaderProps {
  /**
   * First and last day of the shown week.
   */
  weekStart: string
  weekEnd: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}

function weekTitle(weekStart: string, weekEnd: string): string {
  const start = formatDate(weekStart, 'MMMM yyyy')
  const end = formatDate(weekEnd, 'MMMM yyyy')
  if (start === end) {
    return start
  }
  return formatDate(weekStart, 'yyyy') === formatDate(weekEnd, 'yyyy')
    ? `${formatDate(weekStart, 'MMM')} – ${formatDate(weekEnd, 'MMM yyyy')}`
    : `${formatDate(weekStart, 'MMM yyyy')} – ${formatDate(weekEnd, 'MMM yyyy')}`
}

/**
 * The planner's toolbar: the shown week and week navigation. Sized and padded
 * like the Tasks list header.
 */
export function PlannerHeader({
  weekStart,
  weekEnd,
  onPrevious,
  onNext,
  onToday,
}: PlannerHeaderProps): ReactElement {
  return (
    <header className="flex flex-none items-center gap-2 border-b border-border py-2.5 pl-2 pr-3 lg:pl-10">
      <h1 className="min-w-0 flex-1 truncate pl-2.5 text-sm font-medium text-text">
        {weekTitle(weekStart, weekEnd)}
      </h1>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToday}
        title="Go to this week (T)"
        className="window-drag-control text-text-muted"
      >
        Today
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Previous week"
        title="Previous week (←)"
        onClick={onPrevious}
        className="window-drag-control text-text-muted"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Next week"
        title="Next week (→)"
        onClick={onNext}
        className="window-drag-control text-text-muted"
      >
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    </header>
  )
}
