import { useMemo } from 'react';
import { AppState, TaskState } from '@/types';
import { TASK_STATE_PRIORITY, ONE_HOUR } from '@/lib/constants';

interface UseFilteredTasksParams {
  appState: AppState;
  showDoneTasks: boolean;
  selectedProjectId: string | null;
  autoSortTasks: boolean;
}

export function useFilteredTasks({ 
  appState, 
  showDoneTasks, 
  selectedProjectId,
  autoSortTasks 
}: UseFilteredTasksParams) {
  return useMemo(() => {
    const tasks = Object.values(appState.tasks);
    const now = Date.now();

    return tasks.filter(task => {
      // Filter by selected project
      if (selectedProjectId && task.projectId !== selectedProjectId) {
        return false;
      }

      // Handle done/active toggle
      if (showDoneTasks) {
        // Show only DONE tasks
        return task.state === "DONE";
      } else {
        // Show only non-DONE tasks (existing behavior)
        if (task.state === "DONE") {
          return false;
        }

        // Filter out IDLE tasks older than 1 hour to prevent UI clutter
        if (task.state === "IDLE" && task.completedAt && (now - task.completedAt) > ONE_HOUR) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (!autoSortTasks) {
        // Simple sorting: just by creation time (newest first) when auto-sort is disabled
        return b.createdAt - a.createdAt;
      }

      // Auto-sort enabled: use complex priority sorting
      // First priority: pinned tasks at top
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Second priority: state priority (PENDING, WORKING, IDLE)
      const aPriority = TASK_STATE_PRIORITY[a.state as TaskState] ?? 4;
      const bPriority = TASK_STATE_PRIORITY[b.state as TaskState] ?? 4;

      if (aPriority !== bPriority) return aPriority - bPriority;

      // Third priority: creation order (oldest first for stability)
      return a.createdAt - b.createdAt;
    });
  }, [appState, showDoneTasks, selectedProjectId, autoSortTasks]);
}

// Helper hook for task counts
export function useTaskCounts(appState: AppState) {
  return useMemo(() => {
    const allTasks = Object.values(appState.tasks);
    const activeTasks = allTasks.filter(task => task.state !== "DONE").length;
    const doneTasks = allTasks.filter(task => task.state === "DONE").length;
    return { activeTasks, doneTasks };
  }, [appState.tasks]);
}