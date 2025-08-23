import { useMemo } from 'react';
import { AppState } from '@/types';

interface UseFilteredTasksParams {
  appState: AppState;
  showDoneTasks: boolean;
  selectedProjectId: string | null;
}

export function useFilteredTasks({ 
  appState, 
  showDoneTasks, 
  selectedProjectId 
}: UseFilteredTasksParams) {
  return useMemo(() => {
    const tasks = Object.values(appState.tasks);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

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
      // First priority: pinned tasks at top
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Second priority: state priority (PENDING, WORKING, IDLE)
      const statePriority = { PENDING: 0, WORKING: 1, IDLE: 2, DONE: 3 };
      const aPriority = statePriority[a.state as keyof typeof statePriority] ?? 4;
      const bPriority = statePriority[b.state as keyof typeof statePriority] ?? 4;

      if (aPriority !== bPriority) return aPriority - bPriority;

      // Third priority: creation order (oldest first for stability)
      return a.createdAt - b.createdAt;
    });
  }, [appState, showDoneTasks, selectedProjectId]);
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