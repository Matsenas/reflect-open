import { describe, expect, it } from 'vitest'
import {
  defaultColorForTag,
  getTaskGroupId,
  INBOX_GROUP_ID,
  plannerGroupDefinitionsSchema,
  removeGroupDefinition,
  resolvePlannerGroups,
  setTaskGroupTag,
  tagFromGroupName,
  upsertGroupDefinition,
} from './task-group.ts'

describe('getTaskGroupId', () => {
  it('puts an untagged task in the inbox', () => {
    expect(getTaskGroupId('Call the dentist')).toBe(INBOX_GROUP_ID)
  })

  it('reads the first tag, lower-cased', () => {
    expect(getTaskGroupId('Ship the build #Work #urgent')).toBe('work')
  })

  it('does not read a heading marker, a number or a mid-word hash', () => {
    expect(getTaskGroupId('Fix issue #123 in a#b')).toBe(INBOX_GROUP_ID)
  })
})

describe('setTaskGroupTag', () => {
  it('appends a tag to an untagged task', () => {
    expect(setTaskGroupTag('Call the dentist', 'health')).toBe('Call the dentist #health')
  })

  it('replaces the first tag in place', () => {
    expect(setTaskGroupTag('Ship #work [[2026-11-17]]', 'home')).toBe('Ship #home [[2026-11-17]]')
  })

  it('removes the tag when moving to the inbox', () => {
    expect(setTaskGroupTag('Ship #work [[2026-11-17]]', null)).toBe('Ship [[2026-11-17]]')
    expect(setTaskGroupTag('Ship', null)).toBe('Ship')
  })
})

describe('resolvePlannerGroups', () => {
  it('lists the inbox, stored groups in order, then discovered tags', () => {
    const groups = resolvePlannerGroups(
      [
        { tag: 'Work', color: 'blue' },
        { tag: 'home', color: 'green' },
      ],
      ['zeta', 'work', '', 'alpha', 'alpha'],
    )
    expect(groups.map((group) => group.id)).toEqual(['', 'work', 'home', 'alpha', 'zeta'])
    expect(groups[1]).toMatchObject({ tag: 'Work', color: 'blue', isDefined: true })
    expect(groups[3]).toMatchObject({ color: defaultColorForTag('alpha'), isDefined: false })
  })
})

describe('group definitions', () => {
  it('recolours an existing group and adds a new one', () => {
    const definitions = upsertGroupDefinition([{ tag: 'work', color: 'blue' }], 'Work', 'red')
    expect(definitions).toEqual([{ tag: 'work', color: 'red' }])
    expect(upsertGroupDefinition(definitions, 'home', 'green')).toHaveLength(2)
  })

  it('removes a group by tag, ignoring case', () => {
    expect(removeGroupDefinition([{ tag: 'work', color: 'blue' }], 'WORK')).toEqual([])
  })

  it('degrades an unreadable stored list to no groups', () => {
    expect(plannerGroupDefinitionsSchema.parse('nope')).toEqual([])
    expect(plannerGroupDefinitionsSchema.parse([{ tag: 'has space', color: 'blue' }])).toEqual([])
  })
})

describe('tagFromGroupName', () => {
  it('turns a typed name into a tag', () => {
    expect(tagFromGroupName(' #Side project ')).toBe('Side-project')
  })

  it('rejects a name that cannot be a tag', () => {
    expect(tagFromGroupName('123')).toBeNull()
    expect(tagFromGroupName('')).toBeNull()
  })
})
