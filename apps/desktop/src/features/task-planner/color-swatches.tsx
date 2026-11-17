import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { PLANNER_COLORS, type PlannerColorId } from './lib/task-group.ts'

interface ColorSwatchesProps {
  value: PlannerColorId
  onChange: (color: PlannerColorId) => void
}

/**
 * The group palette as a row of round swatches.
 */
export function ColorSwatches({ value, onChange }: ColorSwatchesProps): ReactElement {
  return (
    <div role="radiogroup" aria-label="Group colour" className="flex flex-wrap gap-1.5">
      {PLANNER_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          role="radio"
          aria-checked={value === color.id}
          aria-label={color.label}
          title={color.label}
          onClick={() => onChange(color.id)}
          style={{ backgroundColor: color.value }}
          className="flex size-5 items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          {value === color.id ? <Check aria-hidden strokeWidth={3} className="size-3" /> : null}
        </button>
      ))}
    </div>
  )
}
