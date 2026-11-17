import { useState, type ReactElement } from 'react'

interface AddTaskInputProps {
  groupLabel: string
  onAdd: (text: string) => void
}

/**
 * The quiet "Add task" field under a group. Enter adds the task and keeps the
 * field focused for the next one; Escape clears it.
 */
export function AddTaskInput({ groupLabel, onAdd }: AddTaskInputProps): ReactElement {
  const [text, setText] = useState('')
  return (
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        // Keep typing out of the planner's own single-key shortcuts.
        event.stopPropagation()
        if (event.key === 'Enter' && text.trim() !== '') {
          onAdd(text.trim())
          setText('')
        } else if (event.key === 'Escape') {
          setText('')
          event.currentTarget.blur()
        }
      }}
      placeholder="Add task…"
      aria-label={`Add task to ${groupLabel}`}
      className="h-7 w-full rounded-md bg-transparent px-2 text-xs text-text outline-none placeholder:text-text-muted hover:bg-surface-hover focus:bg-surface-hover"
    />
  )
}
