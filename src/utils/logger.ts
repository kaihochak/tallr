import { invoke } from '@tauri-apps/api/core';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

class Logger {
  private async writeLog(level: LogLevel, message: string, context?: any) {
    try {
      const contextStr = context ? JSON.stringify(context) : undefined;
      await invoke('write_frontend_log', { 
        level: level.toString(), 
        message, 
        context: contextStr 
      });
    } catch (error) {
      // Silently fail - don't break app functionality for logging issues
      console.warn('Failed to write log to backend:', error);
    }
  }

  debug(message: string, context?: any) {
    console.debug(`[DEBUG] ${message}`, context || '');
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: any) {
    console.info(`[INFO] ${message}`, context || '');
    this.writeLog(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: any) {
    console.warn(`[WARN] ${message}`, context || '');
    this.writeLog(LogLevel.WARN, message, context);
  }

  error(message: string, context?: any) {
    console.error(`[ERROR] ${message}`, context || '');
    this.writeLog(LogLevel.ERROR, message, context);
  }

  // Convenience methods for common logging scenarios
  apiCall(endpoint: string, method: string = 'GET') {
    this.debug(`API Call: ${method} ${endpoint}`);
  }

  apiError(endpoint: string, error: any) {
    this.error(`API Error: ${endpoint}`, error);
  }

  stateChange(from: string, to: string, context?: any) {
    this.info(`State change: ${from} → ${to}`, context);
  }

  userAction(action: string, context?: any) {
    this.info(`User action: ${action}`, context);
  }
}

// Export singleton instance
export const logger = new Logger();