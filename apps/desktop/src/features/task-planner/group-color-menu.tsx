import { useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { ColorSwatches } from './color-swatches.tsx'
import type { PlannerColorId, PlannerGroup } from './lib/task-group.ts'

interface GroupColorMenuProps {
  group: PlannerGroup
  onColorChange: (color: PlannerColorId) => void
  onRemove: () => void
}

/**
 * A group's colour dot. For a tag group it opens the palette, plus "Remove
 * group" when the group is stored; the inbox's dot is plain.
 */
export function GroupColorMenu({
  group,
  onColorChange,
  onRemove,
}: GroupColorMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const dot = <span aria-hidden className="size-2.5 rounded-full bg-(--group-color)" />
  if (group.tag === null) {
    return <span className="flex size-5 flex-none items-center justify-center">{dot}</span>
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Change colour of ${group.label}`}
        className="flex size-5 flex-none items-center justify-center rounded-md outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {dot}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <ColorSwatches
          value={group.color}
          onChange={(color) => {
            onColorChange(color)
            setOpen(false)
          }}
        />
        {group.isDefined ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            title="Tasks keep their tag; the group shows again while any task has it"
            onClick={() => {
              onRemove()
              setOpen(false)
            }}
            className="justify-start text-text-muted"
          >
            Remove group
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
