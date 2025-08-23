import { AppState, Task } from '@/types';
import { invoke } from '@tauri-apps/api/core';

// API Configuration for dev/prod environment detection
// Note: Tauri commands are used for all API calls, not HTTP

// API Response Types
export interface ApiResponse<T = any> {
  data: T;
  error?: string;
}

export interface TaskUpsertRequest {
  project: {
    name: string;
    repoPath: string;
  };
  task: Partial<Task>;
}

export interface TaskStateUpdateRequest {
  taskId: string;
  state: string;
}

export interface DebugData {
  cleanedBuffer: string;
  currentState: string;
  detectionHistory: Array<{
    timestamp: number;
    from: string;
    to: string;
    details: string;
    confidence: string;
  }>;
  taskId: string;
}


// Modern API Service using Tauri commands (frontend) and HTTP fallback (health check)
export const ApiService = {
  // Get application state via Tauri command
  async getState(): Promise<AppState> {
    try {
      return await invoke<AppState>('get_tasks');
    } catch (error) {
      console.error('[API] Failed to get state via Tauri:', error);
      throw new Error('Failed to get application state');
    }
  },

  // Update task state via Tauri command
  async updateTaskState(request: TaskStateUpdateRequest): Promise<void> {
    try {
      await invoke('frontend_update_task_state', {
        taskId: request.taskId,
        state: request.state,
        details: undefined
      });
    } catch (error) {
      console.error('[API] Failed to update task state via Tauri:', error);
      throw new Error('Failed to update task state');
    }
  },

  // Mark task as done via Tauri command
  async markTaskDone(taskId: string): Promise<void> {
    try {
      await invoke('frontend_mark_task_done', {
        taskId,
        details: undefined
      });
    } catch (error) {
      console.error('[API] Failed to mark task done via Tauri:', error);
      throw new Error('Failed to mark task done');
    }
  },

  // Mark a task as done (formerly delete task) via Tauri command
  async deleteTask(taskId: string): Promise<void> {
    try {
      await invoke('frontend_mark_task_done', { 
        taskId,
        details: "Marked as done by user"
      });
    } catch (error) {
      console.error('[API] Failed to mark task done via Tauri:', error);
      throw new Error('Failed to mark task done');
    }
  },

  // Toggle task pin status via Tauri command
  async toggleTaskPin(taskId: string, pinned: boolean): Promise<void> {
    try {
      await invoke('frontend_toggle_task_pin', { taskId, pinned });
    } catch (error) {
      console.error('[API] Failed to toggle task pin via Tauri:', error);
      throw new Error('Failed to toggle task pin');
    }
  },

  // Get debug data via Tauri command
  async getDebugData(taskId?: string): Promise<DebugData> {
    try {
      const result = await invoke<any>('frontend_get_debug_data', { taskId });
      return result as DebugData;
    } catch (error) {
      console.error('[API] Failed to get debug data via Tauri:', error);
      throw new Error('Failed to get debug data');
    }
  },


};

// Error handling utilities
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public endpoint?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Retry utility for failed requests
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Development logging (only in dev mode)
const isDev = import.meta.env.DEV;

export function logApiCall(endpoint: string, method: string, data?: any) {
  if (isDev) {
    console.log(`[API] ${method} ${endpoint}`, data);
  }
}

export function logApiError(endpoint: string, error: Error) {
  if (isDev) {
    console.error(`[API] Error at ${endpoint}:`, error);
  }
}