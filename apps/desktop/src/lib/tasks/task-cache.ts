import {
  encodeTaskPath,
  getTaskDueDate,
  isSameTaskPath,
  renderInlineText,
  type OpenTask,
  type TaskSnapshot,
} from '@reflect/core'
import { getTaskKey, isSameTask } from '@/lib/tasks/task-identity.ts'

/**
 * Pure transforms over a cached task list ({@link OpenTask}[]), the optimistic
 * shapes the Tasks view applies before the reindex reconciles. Each takes the
 * current list (possibly `undefined` when a query isn't loaded) and returns the
 * next, leaving `undefined` untouched so a not-loaded completed list (archived
 * off) is a no-op. They identify rows by {@link isSameTask}, the same key the
 * React rows and the mutations use, so an optimistic edit can't target the wrong
 * row. Kept apart from the mutation hooks so they're unit-testable directly and
 * shared by every Tasks write — single-row and bulk alike.
 */

/** Where a note write left each of its tasks: `applyTaskEdits`'s `moved` map. */
export type TaskMoves = ReadonlyMap<string, TaskSnapshot | null>

/** Drop every row matching one of `tasks` from a cached list. */
export function withoutTasks(
  rows: OpenTask[] | undefined,
  tasks: OpenTask[],
): OpenTask[] | undefined {
  return rows?.filter((row) => !tasks.some((task) => isSameTask(row, task)))
}

function withSnapshot(task: OpenTask, to: TaskSnapshot): OpenTask {
  if (to.markdown === task.markdown) {
    return { ...task, astPath: to.astPath, checked: to.checked }
  }
  return {
    ...task,
    astPath: to.astPath,
    checked: to.checked,
    markdown: to.markdown,
    text: renderInlineText(to.markdown),
    dueDate: getTaskDueDate(to.markdown),
  }
}

/**
 * Re-key the cached rows of `notePath` after a write moved its tasks: a row
 * whose task was removed (or is no longer a task) is dropped, one whose task
 * moved takes its new address and content, and untouched rows are kept as is.
 * Returns the same array when nothing changed.
 */
export function withRelocatedTasks(
  rows: OpenTask[] | undefined,
  notePath: string,
  moved: TaskMoves,
): OpenTask[] | undefined
export function withRelocatedTasks(
  rows: readonly OpenTask[],
  notePath: string,
  moved: TaskMoves,
): readonly OpenTask[]
export function withRelocatedTasks(
  rows: readonly OpenTask[] | undefined,
  notePath: string,
  moved: TaskMoves,
): readonly OpenTask[] | undefined {
  if (rows === undefined || moved.size === 0) {
    return rows
  }
  let changed = false
  const relocated = rows.flatMap((task) => {
    if (task.notePath !== notePath) {
      return [task]
    }
    const to = moved.get(encodeTaskPath(task.astPath))
    if (to === undefined) {
      return [task]
    }
    if (to === null) {
      changed = true
      return []
    }
    if (
      isSameTaskPath(to.astPath, task.astPath) &&
      to.markdown === task.markdown &&
      to.checked === task.checked
    ) {
      return [task]
    }
    changed = true
    return [withSnapshot(task, to)]
  })
  return changed ? relocated : rows
}

/** The same task with its checkbox set to `checked`. */
export function withChecked(task: OpenTask, checked: boolean): OpenTask {
  return task.checked === checked ? task : { ...task, checked }
}

/**
 * Move `tasks` to the front of the completed list as checked, de-duping any
 * already present — the optimistic shape of completing them with archived on, so
 * the rows stay visible struck through instead of vanishing until the refetch.
 */
export function asCompleted(
  rows: OpenTask[] | undefined,
  tasks: OpenTask[],
): OpenTask[] | undefined {
  if (rows === undefined) {
    return rows
  }
  const kept = rows.filter((row) => !tasks.some((task) => isSameTask(row, task)))
  return [...tasks.map((task) => withChecked(task, true)), ...kept]
}

/**
 * Move `tasks` into the open list as unchecked, de-duping any already present.
 * The open-tasks query is the primary Tasks view data source, so a not-yet-loaded
 * list materializes as just the reopened rows.
 */
export function asOpen(rows: OpenTask[] | undefined, tasks: OpenTask[]): OpenTask[] {
  const reopened = tasks.map((task) => withChecked(task, false))
  const reopenedKeys = new Set(reopened.map(getTaskKey))
  return [...(rows ?? []).filter((row) => !reopenedKeys.has(getTaskKey(row))), ...reopened]
}

/**
 * Rewrite one task's Markdown in a cached list before the reindex re-derives
 * it. The row keeps its place (the bucket only moves once the index re-reads
 * any due date) but shows the new text, with `text` carrying the *plain*
 * rendering (so search and the row label never see raw `[[…]]`/markup).
 */
export function withEditedTask(
  rows: OpenTask[] | undefined,
  task: OpenTask,
  markdown: string,
): OpenTask[] | undefined {
  const text = renderInlineText(markdown)
  return rows?.map((row) => (isSameTask(row, task) ? { ...row, markdown, text } : row))
}
