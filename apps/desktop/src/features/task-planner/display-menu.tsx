import type { ReactElement } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import type { PlannerDisplay, PlannerDisplayControl } from './use-planner-display.ts'

const OPTIONS: readonly { key: keyof PlannerDisplay; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled todos' },
  { key: 'completed', label: 'Completed todos' },
  { key: 'emptyLists', label: 'Empty lists' },
]

/**
 * The todo list's "Display" menu: which todos and lists it shows.
 */
export function DisplayMenu({ display, toggle }: PlannerDisplayControl): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="text-text-muted">
            <SlidersHorizontal aria-hidden className="size-3.5" />
            Display
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={display[option.key]}
            onCheckedChange={() => toggle(option.key)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
