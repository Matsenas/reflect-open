import type { MarkdownAstPath } from '@meowdown/markdown'
import { z } from 'zod'

const taskPathSchema = z.array(z.number().int().nonnegative()).min(1).readonly()

/** A task's stored address: its child indexes from the note body's AST root, as a JSON array. */
export function encodeTaskPath(astPath: MarkdownAstPath): string {
  return JSON.stringify(astPath)
}

export function decodeTaskPath(column: string): MarkdownAstPath {
  return taskPathSchema.parse(JSON.parse(column))
}

export function isSameTaskPath(left: MarkdownAstPath, right: MarkdownAstPath): boolean {
  return left.length === right.length && left.every((index, i) => index === right[i])
}
