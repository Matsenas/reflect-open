import {
  frontmatterPatchToYaml,
  isOstensiblyEmptyNoteSource,
  upsertFrontmatter,
  type NoteDocumentService,
} from '@reflect/core'
import { createTestCoreServices } from '@reflect/core/testing'
import { userEvent } from 'vitest/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test-utils/render-in-app.tsx'
import { createWasmTestDatabaseService } from '@/test-utils/test-database.ts'
import { NoteAliasesSection } from './note-aliases-section.tsx'

const noteSource = { value: '# A\n' }
const readNoteSource = vi.fn<NoteDocumentService['readSource']>()
const commitNoteFrontmatter = vi.fn<NoteDocumentService['commitFrontmatter']>()

async function renderSection(isAdding: boolean) {
  const onAddingDone = vi.fn()
  const core = createTestCoreServices({
    database: createWasmTestDatabaseService(),
    noteDocuments: {
      readSource: readNoteSource,
      readExisting: async (path) => await readNoteSource(path),
      commitFrontmatter: commitNoteFrontmatter,
      commitSourceEdit: () => Promise.reject(new Error('commitSourceEdit is not stubbed')),
      isOstensiblyEmpty: isOstensiblyEmptyNoteSource,
    },
  })
  const view = await renderInApp(
    <NoteAliasesSection path="notes/a.md" isAdding={isAdding} onAddingDone={onAddingDone} />,
    {
      core,
      graph: { root: '/g', name: 'g', generation: 7 },
      route: { kind: 'note', path: 'notes/a.md' },
    },
  )
  return { ...view, onAddingDone }
}

beforeEach(() => {
  window.sessionStorage.clear()
  noteSource.value = '# A\n'
  readNoteSource.mockReset().mockImplementation(() => Promise.resolve(noteSource.value))
  commitNoteFrontmatter.mockReset().mockImplementation((_path, patch) => {
    noteSource.value = upsertFrontmatter(noteSource.value, frontmatterPatchToYaml(patch))
    return Promise.resolve()
  })
})

describe('NoteAliasesSection', () => {
  it('renders nothing for a note with no aliases while not adding', async () => {
    const view = await renderSection(false)
    await vi.waitFor(() => expect(readNoteSource).toHaveBeenCalled())
    expect(view.container.textContent).toBe('')
    await view.unmount()
  })

  it('lists frontmatter aliases and the title’s // segments', async () => {
    noteSource.value = '---\naliases:\n  - QBR\n---\n# Budget Review // Budget\n'
    const view = await renderSection(false)
    await expect.element(view.getByText('Note aliases')).toBeInTheDocument()
    await expect.element(view.getByText('QBR')).toBeInTheDocument()
    await expect.element(view.getByText('Budget', { exact: true })).toBeInTheDocument()
    // Title segments are edited in the H1, so only the frontmatter row is removable.
    expect(view.getByRole('button', { name: /Remove alias/ }).elements()).toHaveLength(1)
    await view.unmount()
  })

  it('adds the typed alias on Enter and closes the input', async () => {
    const view = await renderSection(true)
    const input = view.getByRole('textbox', { name: 'New alias' })
    await expect.element(input).toHaveFocus()
    await userEvent.type(input, ' QBR {Enter}')
    await vi.waitFor(() => {
      return expect(commitNoteFrontmatter).toHaveBeenCalledWith(
        'notes/a.md',
        { aliases: ['QBR'] },
        7,
      )
    })
    expect(view.onAddingDone).toHaveBeenCalled()
    await view.unmount()
  })

  it('adds through the check button too', async () => {
    const view = await renderSection(true)
    await userEvent.type(view.getByRole('textbox', { name: 'New alias' }), 'QBR')
    await userEvent.click(view.getByRole('button', { name: 'Add alias' }))
    await vi.waitFor(() => {
      return expect(commitNoteFrontmatter).toHaveBeenCalledWith(
        'notes/a.md',
        { aliases: ['QBR'] },
        7,
      )
    })
    await view.unmount()
  })

  it('refuses a name the note already answers to and keeps the input open', async () => {
    const view = await renderSection(true)
    await userEvent.type(view.getByRole('textbox', { name: 'New alias' }), 'a{Enter}')
    await expect.element(view.getByText('This note already has that name')).toBeInTheDocument()
    expect(commitNoteFrontmatter).not.toHaveBeenCalled()
    expect(view.onAddingDone).not.toHaveBeenCalled()
    await view.unmount()
  })

  it('closes without writing on Escape', async () => {
    const view = await renderSection(true)
    await userEvent.type(view.getByRole('textbox', { name: 'New alias' }), 'QBR{Escape}')
    expect(view.onAddingDone).toHaveBeenCalled()
    expect(commitNoteFrontmatter).not.toHaveBeenCalled()
    await view.unmount()
  })

  it('removes a frontmatter alias from its row action', async () => {
    noteSource.value = '---\naliases:\n  - QBR\n  - Budget\n---\n# A\n'
    const view = await renderSection(false)
    await userEvent.click(view.getByRole('button', { name: 'Remove alias QBR' }))
    await vi.waitFor(() => {
      return expect(commitNoteFrontmatter).toHaveBeenCalledWith(
        'notes/a.md',
        { aliases: ['Budget'] },
        7,
      )
    })
    await expect.element(view.getByText('QBR')).not.toBeInTheDocument()
    await view.unmount()
  })
})
