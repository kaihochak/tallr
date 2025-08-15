/**
 * Tally HTTP Client
 * 
 * Handles communication with the Tally backend API
 */
import http from 'http';

export class TallyClient {
  constructor(config) {
    this.config = config;
  }

  /**
   * Make HTTP request to Tally backend
   */
  makeRequest(method, path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.gateway);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
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

      req.on('error', reject);
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Create initial task in Tally
   */
  async createTask(taskId) {
    try {
      await this.makeRequest('POST', '/v1/tasks/upsert', {
        project: {
          name: this.config.project,
          repoPath: this.config.repo,
          preferredIDE: this.config.ide
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
      console.error(`[Tally] Failed to create task:`, error.message);
    }
  }

  /**
   * Update task state
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
      console.error(`[Tally] Failed to update task:`, error.message);
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
      console.error(`[Tally] Failed to mark task done:`, error.message);
    }
  }
}