import type { ReactElement } from 'react'
import { CalendarDays, List } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils.ts'
import { useTasksViewMode, type TasksViewMode } from './use-planner-settings.ts'

const MODES: readonly { mode: TasksViewMode; label: string; icon: ReactElement }[] = [
  { mode: 'list', label: 'List', icon: <List aria-hidden className="size-3.5" /> },
  { mode: 'planner', label: 'Planner', icon: <CalendarDays aria-hidden className="size-3.5" /> },
]

/**
 * The Tasks route's List / Planner switch, shown in both surfaces' headers.
 */
export function TasksViewToggle(): ReactElement {
  const [mode, setMode] = useTasksViewMode()
  return (
    <div
      role="group"
      aria-label="Tasks view"
      className="window-drag-control flex flex-none items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5"
    >
      {MODES.map((option) => (
        <Button
          key={option.mode}
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={mode === option.mode}
          onClick={() => setMode(option.mode)}
          className={cn(
            'text-text-muted',
            mode === option.mode && 'bg-surface text-text shadow-xs hover:bg-surface',
          )}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  )
}
