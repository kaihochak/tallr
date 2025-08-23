/**
 * Tallr HTTP Client
 * 
 * Handles communication with the Tallr backend API
 */
import http from 'http';

export class TallrClient {
  constructor(config) {
    this.config = config;
    this._isOnline = true;
    this._currentGateway = config.gateway;
  }

  /**
   * Check if backend is reachable
   */
  async healthCheck() {
    try {
      await this._makeRequestSingle('GET', '/v1/health', null);
      this._isOnline = true;
      return true;
    } catch (error) {
      this._isOnline = false;
      return false;
    }
  }

  /**
   * Start periodic health pings to maintain connection status
   */
  startHealthPings(intervalMs = 10000) {
    // Don't start multiple intervals
    if (this._healthInterval) {
      return;
    }
    
    this._healthInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        // Health check failed, but we continue pinging
      }
    }, intervalMs);
  }

  /**
   * Stop periodic health pings
   */
  stopHealthPings() {
    if (this._healthInterval) {
      clearInterval(this._healthInterval);
      this._healthInterval = null;
    }
  }


  /**
   * Make HTTP request to Tallr backend with simple retry logic
   */
  async makeRequest(method, path, data, retries = 2) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this._makeRequestSingle(method, path, data);
        this._isOnline = true;
        return result;
      } catch (error) {
        const isLastAttempt = attempt === retries - 1;
        
        if (isLastAttempt) {
          this._isOnline = false;
          throw error;
        }
        
        // Simple 500ms retry delay
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Single HTTP request attempt
   */
  _makeRequestSingle(method, path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this._currentGateway);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        if (error.code === 'ECONNREFUSED') {
          reject(new Error(`Cannot connect to Tallr backend at ${this._currentGateway}. Is Tallr app running?`));
        } else if (error.code === 'ETIMEDOUT') {
          reject(new Error(`Request timeout to Tallr backend`));
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout to Tallr backend'));
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }


  /**
   * Create initial task in Tallr
   */
  async createTask(taskId) {
    try {
      await this.makeRequest('POST', '/v1/tasks/upsert', {
        project: {
          name: this.config.project,
          repoPath: this.config.repo,
          preferredIde: this.config.ide
        },
        task: {
          id: taskId,
          agent: this.config.agent,
          title: this.config.title,
          state: 'IDLE'
        }
      });
      // Task created silently
    } catch (error) {
      console.error(`[Tallr] Failed to create task:`, error.message);
      // Don't fail the entire CLI session if task creation fails
      console.error(`[Tallr] Continuing without tracking...`);
    }
  }

  /**
   * Update task state
   */
  async updateTaskState(taskId, state, details) {
    if (typeof taskId !== 'string' || typeof state !== 'string') {
      throw new Error('Invalid state update parameters');
    }
    
    const payload = {
      taskId: taskId,
      state: state,
      details: details || null
    };
    
    try {
      await this.makeRequest('POST', '/v1/tasks/state', payload);
    } catch (error) {
      // Simple error logging
      console.error(`[Tallr] Failed to update task state:`, error.message);
      throw error;
    }
  }

  /**
   * Mark task as completed
   */
  async markTaskDone(taskId, details) {
    try {
      await this.makeRequest('POST', '/v1/tasks/done', {
        taskId: taskId,
        details: details
      });
      // Task completed silently
    } catch (error) {
      console.error(`[Tallr] Failed to mark task done:`, error.message);
      // Still consider the CLI session successful even if we can't mark it done
    }
  }

  /**
   * Update task details with real-time buffer content
   */
  async updateTaskDetails(taskId, details) {
    try {
      await this.makeRequest('POST', '/v1/tasks/details', {
        taskId: taskId,
        details: details
      });
      // Task details updated silently
    } catch (error) {
      // Silently fail details updates to avoid interfering with CLI operation
    }
  }

  /**
   * Update debug data for pattern detection debugging
   */
  async updateDebugData(debugData) {
    // Validate debug data structure
    if (!debugData || typeof debugData !== 'object') {
      return; // Skip invalid debug data
    }
    
    const payload = {
      debugData: debugData  // Match backend's camelCase expectation (serde rename_all)
    };
    
    try {
      await this.makeRequest('POST', '/v1/debug/update', payload);
      // Debug data updated silently
    } catch (error) {
      // Silently fail debug updates to avoid interfering with CLI operation
    }
  }

  /**
   * Get all tasks from backend for session number calculation
   */
  async getAllTasks() {
    try {
      const response = await this.makeRequest('GET', '/v1/state', null);
      return JSON.parse(response);
    } catch (error) {
      // Return empty state if API call fails
      return { tasks: {}, projects: {} };
    }
  }

  /**
   * Get connection status for UI
   */
  getConnectionStatus() {
    return {
      isOnline: this._isOnline,
      gateway: this._currentGateway
    };
  }
}