import { Task, Project } from '@/types';

/**
 * Calculate session number for a task within its project
 * Only shows session numbers if there are multiple active tasks for the same project
 */
export function calculateSessionNumber(
  task: Task, 
  allTasks: Task[], 
  project: Project | undefined
): number | null {
  if (!project) return null;
  
  // Get all tasks for this project, excluding DONE tasks
  const projectTasks = allTasks
    .filter(t => t.projectId === task.projectId && t.state !== "DONE")
    .sort((a, b) => a.createdAt - b.createdAt); // Sort by creation time (oldest first)
  
  // Only show session numbers if there are multiple active tasks for this project
  if (projectTasks.length <= 1) return null;
  
  // Find the index of current task and add 1 for 1-based numbering
  const taskIndex = projectTasks.findIndex(t => t.id === task.id);
  return taskIndex >= 0 ? taskIndex + 1 : null;
}

/**
 * Get display name for project with optional session number
 */
export function getProjectDisplayName(
  project: Project | undefined, 
  sessionNumber: number | null
): string {
  const baseName = project?.name || "Unknown";
  return sessionNumber ? `${baseName} #${sessionNumber}` : baseName;
}

/**
 * Check if task is in a completed state
 */
export function isTaskCompleted(state: string): boolean {
  return state.toLowerCase() === 'completed' || state.toLowerCase() === 'done';
}

/**
 * Get CSS classes for task state
 */
export function getTaskStateClasses(state: string): string {
  const normalizedState = state.toLowerCase();
  
  switch (normalizedState) {
    case 'pending':
      return 'bg-status-pending shadow-[0_0_8px_var(--status-pending)] animate-pulse';
    case 'working':
      return 'bg-status-working shadow-[0_0_8px_var(--status-working)] animate-pulse';
    case 'completed':
    case 'done':
      return 'bg-status-completed';
    case 'error':
      return 'bg-status-error';
    default:
      return 'bg-status-idle';
  }
}