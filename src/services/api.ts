import { AppState, Task } from '@/types';

// API Configuration
const API_BASE_URL = 'http://127.0.0.1:4317';
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
  currentBuffer: string;
  cleanedBuffer: string;
  patternTests: Array<{
    pattern: string;
    description: string;
    matches: boolean;
    expectedState: string;
  }>;
  currentState: string;
  confidence: string;
  detectionHistory: Array<{
    timestamp: number;
    from: string;
    to: string;
    details: string;
    confidence: string;
  }>;
  taskId: string;
  isActive: boolean;
}

// HTTP Client with timeout and error handling
class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
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

  // Get debug data for pattern detection
  async getDebugData(): Promise<DebugData> {
    return apiClient.get<DebugData>('/v1/debug/patterns');
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