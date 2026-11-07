import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  errorMessage,
  parseNote,
  readNoteAliases,
  withAlias,
  withoutAlias,
  type NoteAliases,
} from '@reflect/core'
import { queryKeys } from '@/lib/query-client.ts'
import { useGraph } from '@/providers/graph-provider.tsx'
import { useAppServices, useCoreServices } from '@/services/services-provider.tsx'

export interface NoteAliasesControl {
  /** `undefined` while the first read is in flight. */
  readonly aliases: NoteAliases | undefined
  readonly add: (alias: string) => Promise<void>
  readonly remove: (alias: string) => Promise<void>
}

/**
 * A note's aliases read from its markdown (the live buffer when open), plus
 * add/remove writes that land in `aliases:` frontmatter. Keyed under the index
 * scope so a reindex — an H1 `//` edit, an external change — refetches it.
 * Writes re-read the note first: `aliases` replaces the whole key, so a list
 * computed from a stale snapshot would drop concurrently-gained entries.
 */
export function useNoteAliases(path: string): NoteAliasesControl {
  const { graph } = useGraph()
  const { noteDocuments } = useCoreServices()
  const { operations } = useAppServices()
  const queryClient = useQueryClient()
  const queryKey = queryKeys.index.noteAliases(graph?.root, path)

  const { data } = useQuery({
    queryKey,
    queryFn: async (): Promise<NoteAliases> => {
      return readNoteAliases(path, await noteDocuments.readSource(path))
    },
    enabled: graph !== null,
  })

  const update = async (
    label: string,
    next: (current: readonly string[]) => string[],
  ): Promise<void> => {
    if (graph === null) {
      return
    }
    try {
      const source = await noteDocuments.readSource(path)
      const current = parseNote({ path, source }).frontmatter.aliases
      const aliases = next(current)
      queryClient.setQueryData<NoteAliases>(queryKey, (state) => {
        return state ? { ...state, frontmatter: aliases } : state
      })
      await noteDocuments.commitFrontmatter(path, { aliases }, graph.generation)
    } catch (cause) {
      operations.start(label).fail(errorMessage(cause))
    } finally {
      void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  }

  return {
    aliases: data,
    add: (alias) => update('Adding alias', (current) => withAlias(current, alias)),
    remove: (alias) => update('Removing alias', (current) => withoutAlias(current, alias)),
  }
}
