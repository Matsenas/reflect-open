import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Play, Plus, Repeat } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import type { PlannerTask } from './lib/planner-task.ts'
import { DURATION_CHOICES, formatDuration, REPEAT_LABELS, REPEAT_RULES } from './lib/task-meta.ts'
import { usePlanner } from './planner-context.ts'
import { TaskActionsMenu } from './task-actions-menu.tsx'

const CHIP_CLASS_NAME =
  'flex h-7 flex-none items-center gap-1.5 rounded-lg bg-surface-active px-2 text-xs font-medium text-text outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/50'
const NO_REPEAT = 'none'

/**
 * The open todo: an editable title, its notes, and chips for a subtodo, the
 * duration (with "start now"), repeat, and the rest of the actions. The title
 * saves on Enter or when focus leaves it, the notes when focus leaves them;
 * Escape closes the card.
 */
export function PlannerTaskEditor({ item }: { item: PlannerTask }): ReactElement {
  const { actions, setExpandedKey } = usePlanner()
  const [title, setTitle] = useState(item.title)
  const [subtodo, setSubtodo] = useState<string | null>(null)

  const { task } = item
  const savedNotes = useQuery({
    queryKey: ['task-planner', 'notes', task.notePath, item.key, task.markdown, task.updatedAt],
    queryFn: () => actions.readNotes(item),
  })
  const [draftNotes, setDraftNotes] = useState<string | null>(null)
  const notes = draftNotes ?? savedNotes.data ?? ''

  const saveNotes = (): void => {
    if (draftNotes !== null && draftNotes !== (savedNotes.data ?? '')) {
      actions.setNotes(item, draftNotes)
    }
  }

  return (
    <div
      onKeyDown={(event) => {
        // The card owns its keys: nothing typed here is a planner shortcut.
        event.stopPropagation()
        if (event.key === 'Escape') {
          setExpandedKey(null)
        }
      }}
      className="min-w-0 flex-1"
    >
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => actions.rename(item, title)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            actions.rename(item, title)
            setExpandedKey(null)
          }
        }}
        aria-label="Todo title"
        className="w-full bg-transparent text-sm leading-6 text-text outline-none"
      />
      <textarea
        value={notes}
        onChange={(event) => setDraftNotes(event.target.value)}
        onBlur={saveNotes}
        placeholder="Notes"
        aria-label="Notes"
        rows={Math.min(Math.max(notes.split('\n').length, 2), 8)}
        className="mt-0.5 w-full resize-none bg-transparent text-sm leading-5 text-text-secondary outline-none placeholder:text-text-muted"
      />
      {subtodo === null ? null : (
        <input
          autoFocus
          value={subtodo}
          onChange={(event) => setSubtodo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && subtodo.trim() !== '') {
              actions.addSubtask(item, subtodo)
              setSubtodo('')
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setSubtodo(null)
            }
          }}
          placeholder="New subtodo"
          aria-label="New subtodo"
          className="mb-1 h-7 w-full rounded-md bg-surface-active px-2 text-sm text-text outline-none placeholder:text-text-muted"
        />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setSubtodo('')} className={CHIP_CLASS_NAME}>
          <Plus aria-hidden className="size-3.5 text-(--group-color)" />
          Subtodo
        </button>
        <div className="flex flex-none items-center gap-px">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Duration: ${formatDuration(item.duration)}`}
              className={`${CHIP_CLASS_NAME} rounded-r-none`}
            >
              <Clock aria-hidden className="size-3.5 text-text-muted" />
              {formatDuration(item.duration)}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-32">
              <DropdownMenuRadioGroup
                value={String(item.duration)}
                onValueChange={(value) => actions.place(item, { duration: Number(value) })}
              >
                {DURATION_CHOICES.map((minutes) => (
                  <DropdownMenuRadioItem closeOnClick key={minutes} value={String(minutes)}>
                    {formatDuration(minutes)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            aria-label="Start now"
            title="Put on today's calendar, starting now"
            onClick={() => actions.startNow(item)}
            className={`${CHIP_CLASS_NAME} rounded-l-none px-1.5`}
          >
            <Play aria-hidden className="size-3.5 fill-accent text-accent" />
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP_CLASS_NAME}>
            <Repeat aria-hidden className="size-3.5 text-text-muted" />
            {item.repeat === null ? 'Repeat' : REPEAT_LABELS[item.repeat]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuRadioGroup
              value={item.repeat ?? NO_REPEAT}
              onValueChange={(value) => {
                return actions.place(item, {
                  repeat: REPEAT_RULES.find((rule) => rule === value) ?? null,
                })
              }}
            >
              <DropdownMenuRadioItem closeOnClick value={NO_REPEAT}>
                Never
              </DropdownMenuRadioItem>
              {REPEAT_RULES.map((rule) => (
                <DropdownMenuRadioItem closeOnClick key={rule} value={rule}>
                  {REPEAT_LABELS[rule]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <TaskActionsMenu item={item} className="size-7 rounded-lg bg-surface-active" />
      </div>
    </div>
  )
}
