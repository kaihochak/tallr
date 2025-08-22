import { AppState, Task } from '@/types';
import { invoke } from '@tauri-apps/api/core';

// API Configuration
const DEFAULT_PORT = '4317';
const PORT = import.meta.env.VITE_TALLR_PORT || DEFAULT_PORT;
const API_BASE_URL = `http://127.0.0.1:${PORT}`;
const DEFAULT_TIMEOUT = 5000; // 5 seconds

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

// HTTP Client with timeout and error handling
class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private cachedToken: string | null = null;

  constructor(baseUrl: string, timeout: number = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private async getAuthToken(): Promise<string> {
    // Return cached token if available
    if (this.cachedToken) {
      console.log('[API] Using cached auth token');
      return this.cachedToken;
    }

    try {
      console.log('[API] Fetching auth token from Tauri backend...');
      // Fetch token from Tauri backend
      const token = await invoke<string>('get_auth_token');
      console.log('[API] Auth token received:', token ? `${token.substring(0, 8)}...` : 'empty');
      this.cachedToken = token;
      return token;
    } catch (error) {
      console.error('[API] Failed to fetch auth token:', error);
      throw new Error('Authentication token not available. Please restart the application.');
    }
  }

  // Clear cached token to force a fresh fetch on next request
  clearAuthToken(): void {
    this.cachedToken = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log('[API] Making request to:', url);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Get the auth token dynamically
    const token = await this.getAuthToken();

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      
      throw new Error('Unknown error occurred');
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

// Create API client instance
const apiClient = new ApiClient(API_BASE_URL);

// API Service Methods
export const ApiService = {
  // Get application state
  async getState(): Promise<AppState> {
    return apiClient.get<AppState>('/v1/state');
  },

  // Upsert a task
  async upsertTask(request: TaskUpsertRequest): Promise<void> {
    return apiClient.post<void>('/v1/tasks/upsert', request);
  },

  // Update task state
  async updateTaskState(request: TaskStateUpdateRequest): Promise<void> {
    return apiClient.post<void>('/v1/tasks/state', request);
  },

  // Mark task as done
  async markTaskDone(taskId: string): Promise<void> {
    return apiClient.post<void>('/v1/tasks/done', { taskId });
  },

  // Delete a task
  async deleteTask(taskId: string): Promise<void> {
    return apiClient.post<void>('/v1/tasks/delete', { taskId });
  },

  // Toggle task pin status
  async toggleTaskPin(taskId: string, pinned: boolean): Promise<void> {
    return apiClient.post<void>('/v1/tasks/pin', { taskId, pinned });
  },

  // Get debug data for pattern detection
  async getDebugData(taskId?: string): Promise<DebugData> {
    const url = taskId ? `/v1/debug/patterns/${taskId}` : '/v1/debug/patterns';
    logApiCall(url, 'GET');
    try {
      const result = await apiClient.get<DebugData>(url);
      return result;
    } catch (error) {
      logApiError(url, error instanceof Error ? error : new Error('Unknown error'));
      throw error;
    }
  },

  // Health check for the local server
  async healthCheck(): Promise<boolean> {
    try {
      await apiClient.get('/v1/state');
      return true;
    } catch {
      return false;
    }
  },

  // Clear cached auth token (useful for retry scenarios)
  clearAuthToken(): void {
    apiClient.clearAuthToken();
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