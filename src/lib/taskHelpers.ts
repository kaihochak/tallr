import { Task, TaskState } from '@/types';
import { TASK_STATE_PRIORITY } from './constants';

/**
 * Get the highest priority state from a list of tasks
 * Lower priority numbers = higher priority states
 */
export function getHighestPriorityState(tasks: Task[]): TaskState {
  if (!tasks.length) return 'IDLE';

  let highestPriority = Infinity;
  let highestPriorityState: TaskState = 'IDLE';

  for (const task of tasks) {
    const priority = TASK_STATE_PRIORITY[task.state];
    if (priority < highestPriority) {
      highestPriority = priority;
      highestPriorityState = task.state;
    }
  }

  return highestPriorityState;
}

/**
 * Sort tasks by state priority and creation time
 */
export function sortTasksByPriority(tasks: Task[]): Task[] {
  return tasks.sort((a, b) => {
    const priorityDiff = TASK_STATE_PRIORITY[a.state] - TASK_STATE_PRIORITY[b.state];
    if (priorityDiff !== 0) return priorityDiff;
    
    // If same priority, sort by creation time (newest first)
    return b.createdAt - a.createdAt;
  });
}

/**
 * Get task count by state
 */
export function getTaskCountByState(tasks: Task[], state: TaskState): number {
  return tasks.filter(task => task.state === state).length;
}

/**
 * Check if a task is considered "active" (PENDING or WORKING)
 */
export function isActiveTask(task: Task): boolean {
  return task.state === 'PENDING' || task.state === 'WORKING';
}

/**
 * Get all active tasks from a collection
 */
export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(isActiveTask);
}