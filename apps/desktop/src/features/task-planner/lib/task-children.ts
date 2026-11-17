/**
 * Line-level edits of what sits under a task in its note: its notes (plain
 * child bullets) and its subtodos (child tasks). `TaskService` edits a task's
 * own line; these reach the lines indented beneath it.
 */

/**
 * Enough of a task to find its line in the note's source.
 */
export interface TaskLine {
  /**
   * The task's Markdown, as the index stores it (no marker, no checkbox).
   */
  readonly markdown: string
  readonly checked: boolean
  /**
   * Which of the note's identical task lines this is, counting from 0.
   */
  readonly occurrence: number
}

const TASK_LINE_RE = /^([ \t]*)[-+*][ \t]+\[([ x])\][ \t]+(\S.*)$/i
const NOTE_LINE_RE = /^[-*][ \t]+(?!\[[ x]\][ \t])(\S.*)$/i

function indentOf(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? ''
}

interface TaskBlock {
  readonly lines: string[]
  /**
   * Index of the task's own line.
   */
  readonly index: number
  /**
   * Index just past the task's last child line.
   */
  readonly end: number
  /**
   * The indentation a direct child of this task is written with.
   */
  readonly childIndent: string
}

function findTaskBlock(source: string, task: TaskLine): TaskBlock | null {
  const lines = source.split('\n')
  const firstLine = task.markdown.split('\n')[0]?.trimEnd() ?? ''
  let seen = 0
  const index = lines.findIndex((line) => {
    const match = TASK_LINE_RE.exec(line)
    if (
      match === null ||
      (match[2] !== ' ') !== task.checked ||
      (match[3] ?? '').trimEnd() !== firstLine
    ) {
      return false
    }
    seen += 1
    return seen > task.occurrence
  })
  const taskLine = lines[index]
  if (taskLine === undefined) {
    return null
  }
  const indent = indentOf(taskLine)
  let end = index + 1
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    const line = lines[cursor] ?? ''
    if (line.trim() === '') {
      continue
    }
    if (indentOf(line).length <= indent.length) {
      break
    }
    end = cursor + 1
  }
  const firstChild = lines.slice(index + 1, end).find((line) => line.trim() !== '')
  const childIndent = firstChild === undefined ? `${indent}  ` : indentOf(firstChild)
  return { lines, index, end, childIndent }
}

/**
 * How many lines of the task's notes there are: the plain bullets directly
 * under it, before anything else, none of them with children of their own.
 */
function countNoteLines(block: TaskBlock): number {
  let count = 0
  for (let cursor = block.index + 1; cursor < block.end; cursor++) {
    const line = block.lines[cursor] ?? ''
    if (indentOf(line) !== block.childIndent || !NOTE_LINE_RE.test(line.trimStart())) {
      break
    }
    count += 1
  }
  // A bullet that has children is an outline, not a note line: leave it be.
  const next = block.lines[block.index + 1 + count]
  if (count > 0 && next !== undefined && block.index + 1 + count < block.end) {
    if (indentOf(next).length > block.childIndent.length) {
      count -= 1
    }
  }
  return count
}

/**
 * The task's notes, one line per plain bullet directly under it; empty when
 * it has none or its line cannot be found.
 */
export function readTaskNotes(source: string, task: TaskLine): string {
  const block = findTaskBlock(source, task)
  if (block === null) {
    return ''
  }
  return block.lines
    .slice(block.index + 1, block.index + 1 + countNoteLines(block))
    .map((line) => NOTE_LINE_RE.exec(line.trimStart())?.[1] ?? '')
    .join('\n')
}

/**
 * The note's source with the task's notes replaced by `notes`, one bullet per
 * non-empty line. Unchanged when the task's line cannot be found.
 */
export function setTaskNotes(source: string, task: TaskLine, notes: string): string {
  const block = findTaskBlock(source, task)
  if (block === null) {
    return source
  }
  const bullets = notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `${block.childIndent}- ${line}`)
  const lines = [...block.lines]
  lines.splice(block.index + 1, countNoteLines(block), ...bullets)
  return lines.join('\n')
}

/**
 * The note's source with a new open subtodo added as the task's last child.
 * Unchanged when the task's line cannot be found.
 */
export function addSubtask(source: string, task: TaskLine, text: string): string {
  const block = findTaskBlock(source, task)
  if (block === null) {
    return source
  }
  const lines = [...block.lines]
  lines.splice(block.end, 0, `${block.childIndent}+ [ ] ${text.trim()}`)
  return lines.join('\n')
}
