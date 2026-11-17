import { isTagName } from '@reflect/core'
import { z } from 'zod'

/**
 * The planner's group palette. A group stores the `id`; `value` is the base
 * colour its dot, card tint and border are mixed from in both themes.
 */
export const PLANNER_COLORS = [
  { id: 'gray', label: 'Gray', value: '#94a3b8' },
  { id: 'red', label: 'Red', value: '#ef4444' },
  { id: 'orange', label: 'Orange', value: '#f97316' },
  { id: 'amber', label: 'Amber', value: '#eab308' },
  { id: 'green', label: 'Green', value: '#22c55e' },
  { id: 'teal', label: 'Teal', value: '#14b8a6' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', value: '#6366f1' },
  { id: 'purple', label: 'Purple', value: '#a855f7' },
  { id: 'pink', label: 'Pink', value: '#ec4899' },
] as const

export type PlannerColorId = (typeof PLANNER_COLORS)[number]['id']

const colorIdSchema = z.enum(PLANNER_COLORS.map((color) => color.id))

const groupDefinitionSchema = z.object({
  tag: z.string().refine(isTagName),
  color: colorIdSchema,
})

/**
 * A group the user created or recoloured: a note tag and its colour.
 */
export type PlannerGroupDefinition = z.infer<typeof groupDefinitionSchema>

/**
 * The stored group list. Anything unreadable degrades to no definitions, the
 * same resilience contract as the settings document it lives in.
 */
export const plannerGroupDefinitionsSchema = z.array(groupDefinitionSchema).catch([])

/**
 * The id of the group that holds every task without a tag.
 */
export const INBOX_GROUP_ID = ''

/**
 * One group as the planner shows it.
 */
export interface PlannerGroup {
  /**
   * The lower-cased tag, or {@link INBOX_GROUP_ID}.
   */
  readonly id: string
  /**
   * The tag as written into tasks (without `#`); null for the inbox.
   */
  readonly tag: string | null
  readonly label: string
  readonly color: PlannerColorId
  /**
   * Whether the user stored this group, as opposed to it being discovered
   * from a tag on a task.
   */
  readonly isDefined: boolean
}

// The same grammar the indexer reads note tags with (`extract.ts`).
const TAG_RE = /(^|\s)#(\p{L}[\p{L}\p{N}/_-]*)/u

interface TagMatch {
  readonly from: number
  readonly to: number
  readonly tag: string
}

function findTag(markdown: string): TagMatch | null {
  const match = TAG_RE.exec(markdown)
  const tag = match?.[2]
  if (match === null || tag === undefined) {
    return null
  }
  const from = match.index + (match[1]?.length ?? 0)
  return { from, to: from + tag.length + 1, tag }
}

/**
 * The group a task belongs to: its first `#tag`, lower-cased, or
 * {@link INBOX_GROUP_ID} without one.
 */
export function getTaskGroupId(markdown: string): string {
  return findTag(markdown)?.tag.toLowerCase() ?? INBOX_GROUP_ID
}

/**
 * The task's first `#tag` as written (without `#`), or null.
 */
export function getTaskGroupTag(markdown: string): string | null {
  return findTag(markdown)?.tag ?? null
}

/**
 * The task's Markdown moved to another group: its first `#tag` replaced by
 * `tag`, appended when it had none, or removed for `null`.
 */
export function setTaskGroupTag(markdown: string, tag: string | null): string {
  const existing = findTag(markdown)
  if (existing === null) {
    const trimmed = markdown.replace(/\s+$/, '')
    if (tag === null) {
      return markdown
    }
    return trimmed.length > 0 ? `${trimmed} #${tag}` : `#${tag}`
  }
  if (tag !== null) {
    return `${markdown.slice(0, existing.from)}#${tag}${markdown.slice(existing.to)}`
  }
  const removed = markdown.slice(0, existing.from) + markdown.slice(existing.to)
  return removed.replaceAll(/[ \t]{2,}/g, ' ').trim()
}

/**
 * The colour value for a palette id.
 */
export function plannerColorValue(id: PlannerColorId): string {
  return PLANNER_COLORS.find((color) => color.id === id)?.value ?? PLANNER_COLORS[0].value
}

/**
 * A stable colour for a tag nobody has coloured yet, so a discovered group
 * keeps its colour between sessions. Never gray, which marks the inbox.
 */
export function defaultColorForTag(tag: string): PlannerColorId {
  let hash = 0
  for (const character of tag.toLowerCase()) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 9973
  }
  const colored = PLANNER_COLORS.slice(1)
  return colored[hash % colored.length]?.id ?? 'blue'
}

/**
 * The groups to show: the inbox, the stored groups in their stored order, then
 * every other tag found on a task, alphabetically.
 */
export function resolvePlannerGroups(
  definitions: readonly PlannerGroupDefinition[],
  taskGroupIds: Iterable<string>,
): PlannerGroup[] {
  const groups = new Map<string, PlannerGroup>()
  groups.set(INBOX_GROUP_ID, {
    id: INBOX_GROUP_ID,
    tag: null,
    label: 'Inbox',
    color: 'gray',
    isDefined: false,
  })
  for (const definition of definitions) {
    const id = definition.tag.toLowerCase()
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        tag: definition.tag,
        label: definition.tag,
        color: definition.color,
        isDefined: true,
      })
    }
  }
  const discovered = [...new Set(taskGroupIds)].filter((id) => !groups.has(id)).sort()
  for (const id of discovered) {
    groups.set(id, {
      id,
      tag: id,
      label: id,
      color: defaultColorForTag(id),
      isDefined: false,
    })
  }
  return [...groups.values()]
}

/**
 * The stored list with `tag`'s colour set, adding the group when it is new.
 */
export function upsertGroupDefinition(
  definitions: readonly PlannerGroupDefinition[],
  tag: string,
  color: PlannerColorId,
): PlannerGroupDefinition[] {
  const id = tag.toLowerCase()
  const exists = definitions.some((definition) => definition.tag.toLowerCase() === id)
  return exists
    ? definitions.map((definition) => {
        return definition.tag.toLowerCase() === id ? { ...definition, color } : definition
      })
    : [...definitions, { tag, color }]
}

/**
 * The stored list without `tag`'s group.
 */
export function removeGroupDefinition(
  definitions: readonly PlannerGroupDefinition[],
  tag: string,
): PlannerGroupDefinition[] {
  const id = tag.toLowerCase()
  return definitions.filter((definition) => definition.tag.toLowerCase() !== id)
}

/**
 * A typed group name as a tag: spaces become dashes and a leading `#` is
 * dropped. Null when the result still is not a valid tag.
 */
export function tagFromGroupName(name: string): string | null {
  const tag = name.trim().replace(/^#+/, '').replaceAll(/\s+/g, '-')
  return isTagName(tag) ? tag : null
}
