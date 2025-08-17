import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppState } from '@/types';

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
        // Mark IDLE tasks as completed for time-based filtering
        Object.values(newState.tasks).forEach(task => {
          const oldTask = currentState.tasks[task.id];
          
          // If task changed to IDLE from any other state, mark completion time
          if (oldTask && oldTask.state !== 'IDLE' && task.state === 'IDLE') {
            task.completedAt = Date.now();
          }
        });
        
        return newState;
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
        const response = await fetch("http://127.0.0.1:4317/v1/state");
        const data = await response.json();
        setAppState(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load tasks:", error);
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