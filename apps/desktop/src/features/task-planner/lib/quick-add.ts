import type { PlannerGroup } from './task-group.ts'

/**
 * A typed new todo, split into its text and the list it names.
 */
export interface QuickAdd {
  readonly text: string
  /**
   * The group an `@list` mention matched; undefined when none was typed or
   * none matched, so the caller's current list applies.
   */
  readonly group: PlannerGroup | undefined
}

const MENTION_RE = /(^|\s)@([\p{L}\p{N}/_-]+)/gu

/**
 * Read `Buy milk @shopping`: the first `@name` that matches a list (by
 * prefix, ignoring case) picks the list and is dropped from the text; any
 * other `@word` stays as typed.
 */
export function parseQuickAdd(input: string, groups: readonly PlannerGroup[]): QuickAdd {
  for (const match of input.matchAll(MENTION_RE)) {
    const name = (match[2] ?? '').toLowerCase()
    const group =
      groups.find((candidate) => candidate.label.toLowerCase() === name) ??
      groups.find((candidate) => candidate.label.toLowerCase().startsWith(name))
    if (group !== undefined) {
      const from = match.index + (match[1]?.length ?? 0)
      const rest = input.slice(0, from) + input.slice(match.index + match[0].length)
      return { text: rest.replaceAll(/\s{2,}/g, ' ').trim(), group }
    }
  }
  return { text: input.trim(), group: undefined }
}
