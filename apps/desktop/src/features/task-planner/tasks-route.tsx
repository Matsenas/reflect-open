import type { ReactElement } from 'react'
import { TasksScreen } from '@/components/tasks/tasks-screen.tsx'
import { TaskPlannerScreen } from './task-planner-screen.tsx'
import { useTasksViewMode } from './use-planner-settings.ts'

/**
 * The Tasks route: Reflect's task list, or the week planner over the same
 * tasks, per the view switch in either header.
 */
export function TasksRoute(): ReactElement {
  const [mode] = useTasksViewMode()
  return mode === 'planner' ? <TaskPlannerScreen /> : <TasksScreen />
}
