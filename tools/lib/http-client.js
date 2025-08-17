/**
 * Tallor HTTP Client
 * 
 * Handles communication with the Tallor backend API
 */
import http from 'http';

export class TallorClient {
  constructor(config) {
    this.config = config;
  }

  /**
   * Make HTTP request to Tallor backend with retry logic
   */
  async makeRequest(method, path, data, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this._makeRequestSingle(method, path, data);
      } catch (error) {
        const isLastAttempt = attempt === retries - 1;
        const isRetriableError = this._isRetriableError(error);
        
        if (isLastAttempt || !isRetriableError) {
          throw error;
        }
        
        // Wait before retry (exponential backoff: 200ms, 400ms, 800ms)
        const delay = 200 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Single HTTP request attempt
   */
  _makeRequestSingle(method, path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.gateway);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        timeout: 5000, // 5 second timeout
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
        // Add more context to connection errors
        if (error.code === 'ECONNREFUSED') {
          reject(new Error(`Cannot connect to Tallor backend at ${this.config.gateway}. Is Tallor app running?`));
        } else if (error.code === 'ENOTFOUND') {
          reject(new Error(`Invalid gateway hostname: ${this.config.gateway}`));
        } else if (error.code === 'ETIMEDOUT') {
          reject(new Error(`Request timeout to Tallor backend`));
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout to Tallor backend'));
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Check if error is retriable
   */
  _isRetriableError(error) {
    // Retry on network errors, timeouts, and 5xx server errors
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND' ||
           error.message.includes('timeout') ||
           (error.message.includes('HTTP 5'));
  }

  /**
   * Create initial task in Tallor
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
      console.error(`[Tallor] Failed to create task:`, error.message);
      // Don't fail the entire CLI session if task creation fails
      console.error(`[Tallor] Continuing without tracking...`);
    }
  }

  /**
   * Update task state with better error handling
   */
  async updateTaskState(taskId, state, details) {
    try {
      await this.makeRequest('POST', '/v1/tasks/state', {
        taskId: taskId,
        state: state,
        details: details
      });
      // State updated silently
    } catch (error) {
      // Only log connection errors once to avoid spam
      if (!this._lastErrorLogged || Date.now() - this._lastErrorLogged > 30000) {
        console.error(`[Tallor] Failed to update task state to ${state}:`, error.message);
        this._lastErrorLogged = Date.now();
      }
      
      // Re-throw for retry logic in state tracker
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
      console.error(`[Tallor] Failed to mark task done:`, error.message);
      // Still consider the CLI session successful even if we can't mark it done
    }
  }

  /**
   * Update debug data for pattern detection debugging
   */
  async updateDebugData(debugData) {
    try {
      await this.makeRequest('POST', '/v1/debug/update', {
        debugData: debugData
      });
      // Debug data updated silently
    } catch (error) {
      // Silently fail debug updates to avoid interfering with CLI operation
    }
  }
}