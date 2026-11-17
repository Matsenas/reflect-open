import type { ReactElement } from 'react'
import {
  ArrowUpRight,
  CheckSquare,
  Clock,
  Copy,
  FolderInput,
  MoreHorizontal,
  Repeat,
  Trash2,
  Type,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { cn } from '@/lib/utils.ts'
import { GroupRing } from './group-ring.tsx'
import type { PlannerTask } from './lib/planner-task.ts'
import { DURATION_CHOICES, formatDuration, REPEAT_LABELS, REPEAT_RULES } from './lib/task-meta.ts'
import { groupColorStyle } from './planner-card-style.ts'
import { usePlanner } from './planner-context.ts'

interface TaskActionsMenuProps {
  item: PlannerTask
  className?: string
}

const NO_REPEAT = 'none'

/**
 * A task's "…" menu: done, move to a list, duration, repeat, copy, duplicate,
 * open its note, delete.
 */
export function TaskActionsMenu({ item, className }: TaskActionsMenuProps): ReactElement {
  const { actions, groups, openNote } = usePlanner()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Task actions"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'flex size-6 flex-none items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-active hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-surface-active',
          className,
        )}
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      {/* React events bubble out of the portal into the row: keep a menu
          click from opening the row's editor or starting a drag. */}
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={() => actions.toggle(item)}>
          <CheckSquare aria-hidden />
          {item.task.checked ? 'Mark as not done' : 'Mark as done'}
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput aria-hidden />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {groups.map((group) => (
              <DropdownMenuItem
                key={group.id}
                disabled={group.id === item.groupId}
                style={groupColorStyle(group.color)}
                onClick={() => actions.place(item, { groupTag: group.tag })}
              >
                <span className="flex size-4 items-center justify-center">
                  <GroupRing group={group} />
                </span>
                <span className="truncate">{group.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Clock aria-hidden />
            Set duration
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Repeat aria-hidden />
            Repeat
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.copyTitle(item)}>
          <Type aria-hidden />
          Copy title
          <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.duplicate(item)}>
          <Copy aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNote(item, false)}>
          <ArrowUpRight aria-hidden />
          Open note
          <DropdownMenuShortcut>↵</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => actions.remove(item)}>
          <Trash2 aria-hidden />
          Delete
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
