import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AppState } from '@/types';
import { ApiService, logApiError } from '@/services/api';
import { notificationService } from '@/services/notificationService';

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

  // Listen for real-time task updates from Tauri events
  useEffect(() => {
    const listeners: Promise<any>[] = [];

    // Listen for task updates
    listeners.push(listen('task-updated', (event: any) => {
      setAppState(prev => {
        const updatedTasks = { ...prev.tasks };
        updatedTasks[event.payload.id] = event.payload;
        return {
          ...prev,
          tasks: updatedTasks,
          updated_at: Date.now()
        };
      });
    }));

    // Listen for task deletions
    listeners.push(listen('task-deleted', (event: any) => {
      const deletedTaskId = event.payload;
      setAppState(prev => {
        const updatedTasks = { ...prev.tasks };
        delete updatedTasks[deletedTaskId];
        return {
          ...prev,
          tasks: updatedTasks,
          updated_at: Date.now()
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
        console.error("Failed to load tasks:", apiError);
        
        // Set user-friendly error messages
        let errorMessage = apiError.message;
        if (apiError.message.includes('ECONNREFUSED') || apiError.message.includes('fetch')) {
          errorMessage = 'Cannot connect to Tallr backend. Make sure the app is running.';
        } else if (apiError.message.includes('timeout')) {
          errorMessage = 'Connection timeout. Please check your connection.';
        } else if (apiError.message.includes('401') || apiError.message.includes('Unauthorized') || apiError.message.includes('HTTP 401')) {
          errorMessage = 'Authentication failed. Click retry to get a fresh token.';
        } else if (apiError.message.includes('500')) {
          errorMessage = 'Server error. Please try again.';
        } else {
          errorMessage = `Failed to load tasks: ${apiError.message}`;
        }
        
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
      console.error("Retry failed:", apiError);
      
      let errorMessage = 'Failed to reconnect. Please try again.';
      if (apiError.message.includes('ECONNREFUSED') || apiError.message.includes('fetch')) {
        errorMessage = 'Cannot connect to Tallr backend. Make sure the app is running.';
      } else if (apiError.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Please check your connection.';
      } else if (apiError.message.includes('401') || apiError.message.includes('Unauthorized') || apiError.message.includes('HTTP 401')) {
        errorMessage = 'Authentication failed. Click retry to get a fresh token.';
      } else {
        errorMessage = `Failed to reconnect: ${apiError.message}`;
      }
      
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