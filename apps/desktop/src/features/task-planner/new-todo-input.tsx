import type { ReactElement, RefObject } from 'react'
import { useState } from 'react'

interface NewTodoInputProps {
  inputRef: RefObject<HTMLInputElement | null>
  onAdd: (text: string) => void
}

/**
 * The "New todo" field on top of the list (N focuses it). Enter adds the todo
 * and keeps the field ready for the next; `@list` files it into a list.
 */
export function NewTodoInput({ inputRef, onAdd }: NewTodoInputProps): ReactElement {
  const [text, setText] = useState('')
  return (
    <div className="relative mx-4 flex-none">
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Keep typing out of the planner's single-key shortcuts.
          event.stopPropagation()
          if (event.key === 'Enter' && text.trim() !== '') {
            onAdd(text)
            setText('')
          } else if (event.key === 'Escape') {
            setText('')
            event.currentTarget.blur()
          }
        }}
        placeholder="New todo @list"
        aria-label="New todo"
        className="h-10 w-full rounded-lg border border-border-strong bg-surface-sunken pl-3 pr-10 text-sm text-text outline-none placeholder:text-text-muted focus:border-ring focus:ring-3 focus:ring-ring/50"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded border border-border-strong font-(family-name:--font-shortcut) text-2xs text-text-muted">
        N
      </kbd>
    </div>
  )
}
