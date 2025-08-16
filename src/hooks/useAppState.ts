import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface Project {
  id: string;
  name: string;
  repoPath: string;
  preferredIde: string;
  githubUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface Task {
  id: string;
  projectId: string;
  agent: string;
  title: string;
  state: string;
  details?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  isRemoving?: boolean;
}

interface AppState {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  updatedAt: number;
}

export function useAppState() {
  const [appState, setAppState] = useState<AppState>({ 
    projects: {}, 
    tasks: {}, 
    updatedAt: 0 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [removingTasks, setRemovingTasks] = useState<Set<string>>(new Set());
  const [taskCountdowns, setTaskCountdowns] = useState<Record<string, number>>({});

  // Listen for backend updates
  useEffect(() => {
    const unlisten = listen<AppState>("tasks-updated", (event) => {
      const newState = event.payload;
      
      // Check for newly completed tasks
      Object.values(newState.tasks).forEach(task => {
        const oldTask = appState.tasks[task.id];
        // If task changed to DONE, IDLE, or any completion state, start removal countdown
        if (oldTask && oldTask.state !== 'IDLE' && task.state === 'IDLE' && 
            (task.details?.includes('session completed') || task.details?.includes('done'))) {
          
          // Mark as completed and start countdown
          task.completedAt = Date.now();
          setTaskCountdowns(prev => ({...prev, [task.id]: 8})); // 8 second countdown
          
          // Start countdown interval
          const countdown = setInterval(() => {
            setTaskCountdowns(prev => {
              const remaining = prev[task.id] - 1;
              if (remaining <= 0) {
                clearInterval(countdown);
                // Remove from UI
                setRemovingTasks(current => new Set([...current, task.id]));
                setTimeout(() => {
                  setAppState(currentState => ({
                    ...currentState,
                    tasks: Object.fromEntries(
                      Object.entries(currentState.tasks).filter(([id]) => id !== task.id)
                    )
                  }));
                  setRemovingTasks(current => {
                    const newSet = new Set(current);
                    newSet.delete(task.id);
                    return newSet;
                  });
                }, 300); // Fade out animation time
                return prev;
              }
              return {...prev, [task.id]: remaining};
            });
          }, 1000);
        }
      });
      
      setAppState(newState);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appState.tasks]);

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
    
    // Poll for updates every 2 seconds
    const interval = setInterval(loadTasks, 2000);
    return () => clearInterval(interval);
  }, []);

  return {
    appState,
    setAppState,
    isLoading,
    removingTasks,
    taskCountdowns
  };
}