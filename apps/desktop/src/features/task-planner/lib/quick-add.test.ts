import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quick-add.ts'
import { resolvePlannerGroups } from './task-group.ts'

const groups = resolvePlannerGroups(
  [
    { tag: 'Personal', color: 'amber' },
    { tag: 'Shopping', color: 'orange' },
  ],
  [],
)

describe('parseQuickAdd', () => {
  it('keeps plain text as is', () => {
    expect(parseQuickAdd('  Buy milk ', groups)).toEqual({ text: 'Buy milk', group: undefined })
  })

  it('picks a list by name or prefix and drops the mention', () => {
    expect(parseQuickAdd('Buy milk @shopping', groups)).toMatchObject({
      text: 'Buy milk',
      group: { id: 'shopping' },
    })
    expect(parseQuickAdd('@pers Call mum', groups)).toMatchObject({
      text: 'Call mum',
      group: { id: 'personal' },
    })
    expect(parseQuickAdd('Sort mail @inbox', groups).group?.id).toBe('')
  })

  it('leaves an unknown mention in the text', () => {
    expect(parseQuickAdd('Ping @alex', groups)).toEqual({ text: 'Ping @alex', group: undefined })
  })
})
