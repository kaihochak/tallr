import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppState } from '@/types';
import { ApiService, logApiError } from '@/services/api';

export function useAppState() {
  const [appState, setAppState] = useState<AppState>({ 
    projects: {}, 
    tasks: {}, 
    updatedAt: 0 
  });
  const [isLoading, setIsLoading] = useState(true);

  // Listen for backend updates
  useEffect(() => {
    const unlisten = listen<AppState>("tasks-updated", (event) => {
      const newState = event.payload;
      
      // Use functional state update to avoid stale closure
      setAppState(currentState => {
        // Create immutable copy of tasks with proper completedAt timestamps
        const updatedTasks = { ...newState.tasks };
        
        Object.values(updatedTasks).forEach(task => {
          const oldTask = currentState.tasks[task.id];
          
          // If task changed to IDLE from any other state, mark completion time
          if (oldTask && oldTask.state !== 'IDLE' && task.state === 'IDLE') {
            // Create new task object with completedAt instead of mutating
            updatedTasks[task.id] = {
              ...task,
              completedAt: Date.now()
            };
          }
        });
        
        // Return new state object with updated tasks
        return {
          ...newState,
          tasks: updatedTasks
        };
      });
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []); // Remove dependency to prevent re-creation

  // Listen for notifications
  useEffect(() => {
    const unlisten = listen<{title: string, body: string}>("show-notification", (event) => {
      // Show browser notification as fallback
      if (Notification.permission === "granted") {
        new Notification(event.payload.title, {
          body: event.payload.body,
          icon: "/tauri.svg"
        });
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Load initial data
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await ApiService.getState();
        setAppState(data);
        setIsLoading(false);
      } catch (error) {
        const apiError = error instanceof Error ? error : new Error('Unknown error');
        logApiError('/v1/state', apiError);
        console.error("Failed to load tasks:", apiError);
        setIsLoading(false);
      }
    };

    loadTasks();
  }, []);

  return {
    appState,
    setAppState,
    isLoading
  };
}