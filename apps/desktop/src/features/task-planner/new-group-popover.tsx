import { useState, type ReactElement, type SyntheticEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { ColorSwatches } from './color-swatches.tsx'
import { tagFromGroupName, type PlannerColorId } from './lib/task-group.ts'

interface NewGroupPopoverProps {
  onCreate: (tag: string, color: PlannerColorId) => void
}

/**
 * "New group": name a group and pick its colour. The name becomes the `#tag`
 * the group's tasks carry.
 */
export function NewGroupPopover({ onCreate }: NewGroupPopoverProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<PlannerColorId>('blue')
  const tag = tagFromGroupName(name)

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault()
    if (tag === null) {
      return
    }
    onCreate(tag, color)
    setName('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="xs" className="text-text-muted">
            <Plus aria-hidden className="size-3.5" />
            New group
          </Button>
        }
      />
      <PopoverContent align="start" side="top" className="w-60">
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name"
            aria-label="Group name"
            aria-invalid={name.trim() !== '' && tag === null}
          />
          <ColorSwatches value={color} onChange={setColor} />
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-text-muted">
              {tag === null ? 'Start with a letter' : `Tasks tagged #${tag}`}
            </span>
            <Button type="submit" size="xs" disabled={tag === null}>
              Create
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
