import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { MarkdownPreview } from '@/editor/markdown-preview.tsx'
import { cn } from '@/lib/utils.ts'
import type { PlannerTask } from './lib/planner-task.ts'

interface PlannerTaskContentProps {
  item: PlannerTask
  /**
   * A line under the title, such as the block's time range.
   */
  detail?: string | null
  /**
   * Omitted for a card that only previews a drag.
   */
  onToggle?: () => void
}

/**
 * The inside of every planner card: the round checkbox in the group's colour
 * and the task's title rendered as Markdown.
 */
export function PlannerTaskContent({
  item,
  detail = null,
  onToggle,
}: PlannerTaskContentProps): ReactElement {
  const { checked } = item.task
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? 'Reopen task' : 'Complete task'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onToggle?.()
        }}
        className={cn(
          'mt-[3px] flex size-3.5 flex-none items-center justify-center rounded-full border border-(--group-color) text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          checked && 'bg-(--group-color)',
        )}
      >
        {checked ? <Check aria-hidden strokeWidth={3} className="size-2.5" /> : null}
      </button>
      <div className={cn('min-w-0 flex-1', checked && 'line-through opacity-60')}>
        {item.title === '' ? (
          <span className="text-xs leading-5 text-text-muted">Untitled task</span>
        ) : (
          <MarkdownPreview
            content={item.title}
            sourcePath={item.task.notePath}
            singleParagraph
            className="reflect-task-preview pointer-events-none [--text-sm:0.8125rem] [overflow-wrap:anywhere]"
          />
        )}
        {detail === null ? null : (
          <div className="truncate text-[11px] leading-4 tabular-nums text-text-muted">
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}
