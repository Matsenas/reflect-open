import {
  parseMarkdownAst,
  resolveMarkdownAstPath,
  serializeMarkdownAst,
  walkMarkdownAst,
  type MarkdownAstPath,
  type MarkdownBlock,
  type MarkdownBlockquote,
  type MarkdownDocument,
  type MarkdownListItem,
  type MarkdownNode,
  type MarkdownTableCell,
} from '@meowdown/markdown'
import { TaskStaleError } from './edit.ts'
import { splitFrontmatter } from './frontmatter.ts'
import { documentLineEnding } from './line-endings.ts'
import { normalizeWikiTarget } from './resolve.ts'
import { scanInlineWikiLinks } from './scan.ts'
import { encodeTaskPath, isSameTaskPath } from './task-path.ts'

/** The note cannot be rewritten through the AST without changing its content. */
export class NoteNotSerializableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoteNotSerializableError'
  }
}

type BlockParent = MarkdownDocument | MarkdownBlockquote | MarkdownListItem | MarkdownTableCell

function isBlockParent(node: MarkdownNode): node is BlockParent {
  return (
    node.type === 'document' ||
    node.type === 'blockquote' ||
    node.type === 'listItem' ||
    node.type === 'tableCell'
  )
}

/** A Reflect task: a round (`+`) checkbox item, wherever it sits in the body. */
export function isRoundTask(node: MarkdownNode): node is MarkdownListItem {
  return node.type === 'listItem' && node.kind === 'task' && node.marker === '+'
}

/** The Markdown of an item's first paragraph: a task's text, or a parent's breadcrumb label. */
export function getFirstParagraphMarkdown(item: MarkdownListItem): string {
  const first = item.children[0]
  return first?.type === 'paragraph' ? first.value : ''
}

export interface TaskEntry {
  node: MarkdownListItem
  parent: BlockParent
  astPath: MarkdownAstPath
  /** First-paragraph Markdown of the ancestor list items, outermost first. */
  breadcrumbs: readonly string[]
}

export function getRoundTasks(document: MarkdownDocument): TaskEntry[] {
  const breadcrumbsOf = new Map<MarkdownNode, readonly string[]>([[document, []]])
  const entries: TaskEntry[] = []
  for (const { node, parent, path } of walkMarkdownAst(document)) {
    if (parent === undefined) {
      continue
    }
    const inherited = breadcrumbsOf.get(parent) ?? []
    const label = node.type === 'listItem' ? getFirstParagraphMarkdown(node) : ''
    breadcrumbsOf.set(node, label === '' ? inherited : [...inherited, label])
    if (isRoundTask(node) && isBlockParent(parent)) {
      entries.push({ node, parent, astPath: path, breadcrumbs: inherited })
    }
  }
  return entries
}

/** The first calendar-valid `[[YYYY-MM-DD]]` link in a task's Markdown, or null. */
export function getTaskDueDate(markdown: string): string | null {
  for (const link of scanInlineWikiLinks(markdown)) {
    const { date } = normalizeWikiTarget(link.target)
    if (date !== undefined) {
      return date
    }
  }
  return null
}

export interface ProjectedTask {
  astPath: MarkdownAstPath
  /** The task's first paragraph, marker excluded. */
  markdown: string
  /** Ancestor list items' first paragraphs, outermost first. */
  breadcrumbs: readonly string[]
  checked: boolean
  dueDate: string | null
}

/** The round tasks of a note body, in document order. */
export function projectTasks(body: string): ProjectedTask[] {
  return getRoundTasks(parseMarkdownAst(body)).map(toProjectedTask)
}

function toProjectedTask(entry: TaskEntry): ProjectedTask {
  const markdown = getFirstParagraphMarkdown(entry.node)
  return {
    astPath: entry.astPath,
    markdown,
    breadcrumbs: entry.breadcrumbs,
    checked: entry.node.checked,
    dueDate: getTaskDueDate(markdown),
  }
}

/** Where a task was last seen; `markdown` and `checked` are the staleness guard. */
export interface TaskLocator {
  astPath: MarkdownAstPath
  markdown: string
  checked: boolean
}

export type InsertPosition =
  | { kind: 'documentEnd' }
  /** The end of the task's parent list item; refused when the task is at the root. */
  | { kind: 'contextEnd'; task: TaskLocator }
  | { kind: 'afterTask'; task: TaskLocator }
  /** After any block, for example the last item of the list under a heading. */
  | { kind: 'afterBlock'; astPath: MarkdownAstPath }

export type TaskEdit =
  | { kind: 'toggle'; task: TaskLocator }
  | { kind: 'setMarkdown'; task: TaskLocator; markdown: string }
  | { kind: 'remove'; task: TaskLocator }
  | { kind: 'toBullet'; task: TaskLocator }
  | { kind: 'insert'; at: InsertPosition; markdown: string }

export interface TaskSnapshot {
  astPath: MarkdownAstPath
  markdown: string
  checked: boolean
}

export interface TaskEditResult {
  source: string
  /**
   * Every pre-edit round task by `encodeTaskPath(oldPath)`: where it is now, or
   * null once removed or no longer a task.
   */
  moved: ReadonlyMap<string, TaskSnapshot | null>
  /** The inserted tasks, in edit order. */
  inserted: readonly TaskSnapshot[]
  /** The round tasks of the new source, in document order. */
  tasks: readonly TaskSnapshot[]
}

interface ItemTarget {
  node: MarkdownListItem
  parent: BlockParent
}

interface SlotTarget {
  parent: BlockParent
  anchor: MarkdownBlock | null
  place: 'after' | 'end'
}

type InsertEdit = Extract<TaskEdit, { kind: 'insert' }>
type ItemEdit = Exclude<TaskEdit, { kind: 'insert' }>

type PlannedEdit = { edit: InsertEdit; slot: SlotTarget } | { edit: ItemEdit; item: ItemTarget }

/**
 * Apply `edits` to a note and serialize its body once. Every locator describes
 * the note as the caller last saw it: all addresses are resolved against the
 * pre-edit tree before anything changes, so one batch can edit a task and then
 * toggle it, or resolve a task and insert next to it, with one locator each.
 */
export function applyTaskEdits(source: string, edits: readonly TaskEdit[]): TaskEditResult {
  const { body, bodyOffset } = splitFrontmatter(source)
  const document = parseMarkdownAst(body)
  if (body === '') {
    document.children = []
  }
  assertSerializable(document)

  const before = getRoundTasks(document)
  const planned = edits.map((edit): PlannedEdit =>
    edit.kind === 'insert'
      ? { edit, slot: resolveInsertPosition(document, before, edit.at) }
      : { edit, item: locateTask(document, before, edit.task) },
  )

  const created: MarkdownListItem[] = []
  const removed = new Set<MarkdownListItem>()
  for (const plan of planned) {
    if ('slot' in plan) {
      const item = createTaskItem(requireParagraphMarkdown(plan.edit.markdown))
      const siblings = plan.slot.parent.children
      siblings.splice(resolveSlotIndex(siblings, plan.slot), 0, item)
      created.push(item)
      continue
    }
    const { node, parent } = plan.item
    if (removed.has(node)) {
      throw new TaskStaleError('the task was removed earlier in this batch')
    }
    const edit = plan.edit
    switch (edit.kind) {
      case 'toggle': {
        node.checked = !node.checked
        if (!node.checked) {
          delete node.taskMarker
        }
        break
      }
      case 'setMarkdown': {
        setFirstParagraph(node, requireParagraphMarkdown(edit.markdown))
        break
      }
      case 'remove': {
        const index = requireIndex(parent.children, node)
        parent.children.splice(index, 1, ...node.children.slice(1))
        removed.add(node)
        break
      }
      case 'toBullet': {
        node.kind = 'bullet'
        node.checked = false
        node.collapsed = true
        delete node.taskMarker
        break
      }
    }
  }

  const after = getRoundTasks(document)
  const snapshotOf = new Map<MarkdownNode, TaskSnapshot>(
    after.map((entry) => [entry.node, toTaskSnapshot(entry)] as const),
  )
  const moved = new Map<string, TaskSnapshot | null>(
    before.map(
      (entry) => [encodeTaskPath(entry.astPath), snapshotOf.get(entry.node) ?? null] as const,
    ),
  )
  const inserted = created.map((item) => {
    const snapshot = snapshotOf.get(item)
    if (snapshot === undefined) {
      throw new NoteNotSerializableError('the new task did not survive the edit')
    }
    return snapshot
  })

  const serializedBody = document.children.length === 0 ? '' : serializeMarkdownAst(document)
  const nextBody = restoreLineEnding(serializedBody, source)
  assertTasksSurvive(nextBody, after)
  return {
    source: source.slice(0, bodyOffset) + nextBody,
    moved,
    inserted,
    tasks: after.map(toTaskSnapshot),
  }
}

function toTaskSnapshot(entry: TaskEntry): TaskSnapshot {
  return {
    astPath: entry.astPath,
    markdown: getFirstParagraphMarkdown(entry.node),
    checked: entry.node.checked,
  }
}

function assertSerializable(document: MarkdownDocument): void {
  if (document.children.length === 0) {
    return
  }
  const reparsed = parseMarkdownAst(serializeMarkdownAst(document))
  if (JSON.stringify(reparsed) !== JSON.stringify(document)) {
    throw new NoteNotSerializableError(
      'This note cannot be rewritten faithfully. Edit the task in the note itself.',
    )
  }
}

function matchesLocator(item: MarkdownListItem, locator: TaskLocator): boolean {
  return item.checked === locator.checked && getFirstParagraphMarkdown(item) === locator.markdown
}

function locateTask(
  document: MarkdownDocument,
  before: readonly TaskEntry[],
  locator: TaskLocator,
): ItemTarget {
  const found = resolveMarkdownAstPath(document, locator.astPath)
  if (
    found !== undefined &&
    found.parent !== undefined &&
    isBlockParent(found.parent) &&
    isRoundTask(found.node) &&
    matchesLocator(found.node, locator)
  ) {
    return { node: found.node, parent: found.parent }
  }
  const candidates = before.filter((entry) => matchesLocator(entry.node, locator))
  const candidate = candidates[0]
  if (candidates.length === 1 && candidate !== undefined) {
    return { node: candidate.node, parent: candidate.parent }
  }
  const text = JSON.stringify(locator.markdown)
  throw new TaskStaleError(
    candidates.length === 0
      ? `task is no longer in the note: ${text}`
      : `task is ambiguous: ${text}`,
  )
}

function resolveInsertPosition(
  document: MarkdownDocument,
  before: readonly TaskEntry[],
  at: InsertPosition,
): SlotTarget {
  switch (at.kind) {
    case 'documentEnd': {
      return { parent: document, anchor: null, place: 'end' }
    }
    case 'contextEnd': {
      const { parent } = locateTask(document, before, at.task)
      if (parent.type !== 'listItem') {
        throw new TaskStaleError('task no longer has a parent list context')
      }
      return { parent, anchor: null, place: 'end' }
    }
    case 'afterTask': {
      const { node, parent } = locateTask(document, before, at.task)
      return { parent, anchor: node, place: 'after' }
    }
    case 'afterBlock': {
      const found = resolveMarkdownAstPath(document, at.astPath)
      if (found?.parent === undefined || !isBlockParent(found.parent)) {
        throw new TaskStaleError('insert position is gone')
      }
      const target = found.node
      const anchor = found.parent.children.find((child) => child === target)
      if (anchor === undefined) {
        throw new TaskStaleError('insert position is gone')
      }
      return { parent: found.parent, anchor, place: 'after' }
    }
  }
}

/** Indexes are computed when the edit is applied, so earlier edits in the batch cannot stale them. */
function resolveSlotIndex(siblings: MarkdownBlock[], slot: SlotTarget): number {
  if (slot.anchor === null) {
    return siblings.length
  }
  return requireIndex(siblings, slot.anchor) + 1
}

function requireIndex(siblings: MarkdownBlock[], node: MarkdownBlock): number {
  const index = siblings.indexOf(node)
  if (index === -1) {
    throw new TaskStaleError('the task was removed earlier in this batch')
  }
  return index
}

function requireParagraphMarkdown(markdown: string): string {
  const trimmed = markdown.replaceAll(/\r\n?/g, '\n').trim()
  if (/\n[ \t]*\n/.test(trimmed)) {
    throw new TaskStaleError(`task content must be one paragraph: ${JSON.stringify(markdown)}`)
  }
  return trimmed
}

function setFirstParagraph(item: MarkdownListItem, markdown: string): void {
  const first = item.children[0]
  if (first?.type === 'paragraph') {
    first.value = markdown
  } else {
    item.children.unshift({ type: 'paragraph', value: markdown })
  }
}

function createTaskItem(markdown: string): MarkdownListItem {
  return {
    type: 'listItem',
    kind: 'task',
    marker: '+',
    checked: false,
    collapsed: false,
    children: [{ type: 'paragraph', value: markdown }],
  }
}

function restoreLineEnding(body: string, source: string): string {
  return documentLineEnding(source) === '\r\n' ? body.replaceAll('\n', '\r\n') : body
}

/** The written bytes must read back with the same tasks at the same paths. */
function assertTasksSurvive(body: string, expected: readonly TaskEntry[]): void {
  const actual = getRoundTasks(parseMarkdownAst(body))
  const survives =
    actual.length === expected.length &&
    actual.every((entry, i) => {
      const wanted = expected[i]
      return (
        wanted !== undefined &&
        isSameTaskPath(entry.astPath, wanted.astPath) &&
        entry.node.checked === wanted.node.checked &&
        getFirstParagraphMarkdown(entry.node) === getFirstParagraphMarkdown(wanted.node)
      )
    })
  if (!survives) {
    throw new NoteNotSerializableError(
      'This text cannot be saved as one task. Remove the line that starts a new block and try again.',
    )
  }
}
