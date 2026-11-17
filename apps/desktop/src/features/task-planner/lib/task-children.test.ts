import { describe, expect, it } from 'vitest'
import { addSubtask, readTaskNotes, setTaskNotes, type TaskLine } from './task-children.ts'

const NOTE = [
  '# Tue',
  '',
  '+ [ ] Plan trip #personal',
  '  - Check passport',
  '  - Ask Ann about dates',
  '  + [ ] Book flights',
  '+ [ ] Plain task',
  '+ [x] Done task',
  '',
  'Trailing paragraph',
].join('\n')

const trip: TaskLine = { markdown: 'Plan trip #personal', checked: false, occurrence: 0 }
const plain: TaskLine = { markdown: 'Plain task', checked: false, occurrence: 0 }

describe('readTaskNotes', () => {
  it('reads the plain bullets directly under the task', () => {
    expect(readTaskNotes(NOTE, trip)).toBe('Check passport\nAsk Ann about dates')
  })

  it('reads nothing for a task without notes or one it cannot find', () => {
    expect(readTaskNotes(NOTE, plain)).toBe('')
    expect(readTaskNotes(NOTE, { ...plain, markdown: 'Missing' })).toBe('')
  })

  it('does not treat a bullet with children as a note', () => {
    const source = ['+ [ ] Task', '  - Outline', '    - Deeper'].join('\n')
    expect(readTaskNotes(source, { markdown: 'Task', checked: false, occurrence: 0 })).toBe('')
  })
})

describe('setTaskNotes', () => {
  it('replaces the notes and keeps the subtodos', () => {
    const next = setTaskNotes(NOTE, trip, 'Renew passport\n\n')
    expect(next).toContain('+ [ ] Plan trip #personal\n  - Renew passport\n  + [ ] Book flights')
  })

  it('adds notes to a task that has none', () => {
    expect(setTaskNotes(NOTE, plain, 'One\nTwo')).toContain(
      '+ [ ] Plain task\n  - One\n  - Two\n+ [x] Done task',
    )
  })

  it('removes the notes when cleared', () => {
    expect(setTaskNotes(NOTE, trip, '')).toContain(
      '+ [ ] Plan trip #personal\n  + [ ] Book flights',
    )
  })

  it('round-trips with readTaskNotes', () => {
    expect(readTaskNotes(setTaskNotes(NOTE, plain, 'A\nB'), plain)).toBe('A\nB')
  })
})

describe('addSubtask', () => {
  it('appends after the existing children', () => {
    expect(addSubtask(NOTE, trip, 'Book hotel')).toContain(
      '  + [ ] Book flights\n  + [ ] Book hotel\n+ [ ] Plain task',
    )
  })

  it('starts the children of a childless task', () => {
    expect(addSubtask(NOTE, plain, 'Step one')).toContain(
      '+ [ ] Plain task\n  + [ ] Step one\n+ [x] Done task',
    )
  })

  it('addresses the right one of two identical tasks', () => {
    const source = ['+ [ ] Same', '+ [ ] Same'].join('\n')
    expect(addSubtask(source, { markdown: 'Same', checked: false, occurrence: 1 }, 'Child')).toBe(
      '+ [ ] Same\n+ [ ] Same\n  + [ ] Child',
    )
  })

  it('leaves the note alone when the task is gone', () => {
    expect(addSubtask(NOTE, { ...plain, checked: true }, 'Nope')).toBe(NOTE)
  })
})
