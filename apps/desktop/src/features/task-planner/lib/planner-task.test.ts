import { describe, expect, it } from 'vitest'
import type { OpenTask } from '@reflect/core'
import { buildPlannerTasks, getTaskTitle, placeTask, retitleTask } from './planner-task.ts'

function row(markdown: string, astPath: number[], overrides: Partial<OpenTask> = {}): OpenTask {
  return {
    astPath,
    markdown,
    checked: false,
    text: markdown,
    breadcrumbs: [],
    dueDate: null,
    notePath: 'daily/2026-11-17.md',
    noteTitle: 'Tue',
    dailyDate: '2026-11-17',
    isPinned: false,
    pinnedOrder: null,
    updatedAt: 0,
    ...overrides,
  }
}

function only(
  markdown: string,
): ReturnType<typeof buildPlannerTasks> extends Map<string, infer T> ? T : never {
  const [item] = buildPlannerTasks([row(markdown, [0, 0])]).values()
  if (item === undefined) {
    throw new Error('no task built')
  }
  return item
}

describe('getTaskTitle', () => {
  it('strips everything the planner draws', () => {
    expect(getTaskTitle('Gym #Health [[2026-11-18]] 09:30-10:15 (weekly)')).toBe('Gym')
    expect(getTaskTitle('Read [[Atomic Habits]] (45m) #book')).toBe('Read [[Atomic Habits]]')
  })
})

describe('buildPlannerTasks', () => {
  it('nests a task under the task above it and shares its group', () => {
    const items = [
      ...buildPlannerTasks([
        row('Book flights', [0, 0, 1, 0]),
        row('Plan trip #personal', [0, 0]),
        row('Other', [0, 1]),
        row('Pack #home', [0, 0, 1, 1]),
      ]).values(),
    ]
    expect(items.map((item) => item.title)).toEqual(['Plan trip', 'Book flights', 'Pack', 'Other'])
    expect(items[1]).toMatchObject({ parentKey: items[0]?.key, groupId: 'personal' })
    expect(items[2]).toMatchObject({ parentKey: items[0]?.key, groupId: 'home' })
    expect(items[3]).toMatchObject({ parentKey: null, groupId: '' })
  })

  it('numbers identical lines in a note', () => {
    const items = [...buildPlannerTasks([row('Same', [0, 1]), row('Same', [0, 0])]).values()]
    expect(items.map((item) => item.occurrence)).toEqual([0, 1])
  })

  it('reads the duration from the time block, the token, or the default', () => {
    expect(only('A [[2026-11-18]] 09:00-10:30').duration).toBe(90)
    expect(only('A (45m)').duration).toBe(45)
    expect(only('A').duration).toBe(30)
  })
})

describe('placeTask', () => {
  it('uses the duration token when dropped on the grid and drops the token', () => {
    const item = only('Deep work (1h30m) #work')
    expect(
      placeTask(item, { schedule: { date: '2026-11-18', time: { start: 540, end: 630 } } }),
    ).toBe('Deep work #work [[2026-11-18]] 09:00-10:30')
  })

  it('keeps a non-default length when a block leaves the grid', () => {
    const item = only('Deep work [[2026-11-18]] 09:00-10:30')
    expect(placeTask(item, { schedule: null })).toBe('Deep work (1h30m)')
    expect(placeTask(only('Quick [[2026-11-18]] 09:00-09:30'), { schedule: null })).toBe('Quick')
  })

  it('resizes a timed block and stores the length of an untimed task', () => {
    expect(placeTask(only('A [[2026-11-18]] 09:00-09:30'), { duration: 60 })).toBe(
      'A [[2026-11-18]] 09:00-10:00',
    )
    expect(placeTask(only('A'), { duration: 60 })).toBe('A (1h)')
    expect(placeTask(only('A (1h)'), { duration: 30 })).toBe('A')
  })

  it('sets the repeat rule and the group', () => {
    expect(placeTask(only('A'), { repeat: 'weekly', groupTag: 'home' })).toBe('A (weekly) #home')
  })
})

describe('retitleTask', () => {
  it('keeps the group, schedule, duration and repeat', () => {
    const item = only('Gym #Health [[2026-11-18]] 09:30-10:00 (weekly)')
    expect(retitleTask(item, ' Swim ')).toBe('Swim #Health [[2026-11-18]] 09:30-10:00 (weekly)')
  })

  it('lets a typed tag change the group', () => {
    expect(retitleTask(only('Gym #Health (45m)'), 'Gym #sport')).toBe('Gym #sport (45m)')
  })
})
