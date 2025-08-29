import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AppState } from '@/types';
import { ApiService, logApiError } from '@/services/api';
import { notificationService } from '@/services/notificationService';
import { getErrorMessage, logError } from '@/utils/errorUtils';

export function useAppState() {
  const [appState, setAppState] = useState<AppState>({ 
    projects: {}, 
    tasks: {}, 
    updatedAt: 0 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const unlisten = listen<{title: string, body: string}>("show-notification", async (event) => {
      // Check if notifications are enabled in settings
      try {
        const settings = await invoke<any>("load_settings");
        if (settings.notificationsEnabled !== false) { // Default to true if not set
          await notificationService.showNotification({
            title: event.payload.title,
            body: event.payload.body
          });
        }
      } catch (error) {
        console.error("Failed to check notification settings:", error);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Listen for individual task events (in addition to the bulk updates above)
  useEffect(() => {
    const listeners: Promise<any>[] = [];

    // Listen for single task updates
    listeners.push(listen('task-updated', (event: { payload: any }) => {
      setAppState(prev => ({
        ...prev,
        tasks: {
          ...prev.tasks,
          [event.payload.id]: event.payload
        },
        updatedAt: Date.now()
      }));
    }));

    // Listen for task deletions
    listeners.push(listen('task-deleted', (event: { payload: string }) => {
      setAppState(prev => {
        const { [event.payload]: deleted, ...remainingTasks } = prev.tasks;
        return {
          ...prev,
          tasks: remainingTasks,
          updatedAt: Date.now()
        };
      });
    }));

    return () => {
      listeners.forEach(unlisten => unlisten.then(fn => fn()));
    };
  }, []);

  // Load initial data
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await ApiService.getState();
        setAppState(data);
        setError(null); // Clear any previous errors
        setIsLoading(false);
      } catch (error) {
        const apiError = error instanceof Error ? error : new Error('Unknown error');
        logApiError('/v1/state', apiError);
        logError('useAppState.loadTasks', apiError);
        
        const errorMessage = getErrorMessage(apiError, 'Failed to load tasks');
        setError(errorMessage);
        setIsLoading(false);
      }
    };

    loadTasks();
  }, []);

  // Retry function to attempt reconnection
  const retryConnection = async () => {
    setIsLoading(true);
    setError(null);
    
    // Refresh state to ensure we have latest data
    
    try {
      const data = await ApiService.getState();
      setAppState(data);
      setError(null);
      setIsLoading(false);
    } catch (error) {
      const apiError = error instanceof Error ? error : new Error('Unknown error');
      logApiError('/v1/state', apiError);
      logError('useAppState.retryConnection', apiError);
      
      const errorMessage = getErrorMessage(apiError, undefined, true);
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return {
    appState,
    setAppState,
    isLoading,
    error,
    retryConnection
  };
}