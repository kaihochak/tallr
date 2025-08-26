/**
 * Node.js Debug Utility for CLI Wrapper
 * 
 * Simple structured logging for the CLI wrapper components
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

class DebugLogger {
  constructor() {
    this.enabled = this.isDebugEnabled();
    this.namespaces = this.parseDebugNamespaces();
    this.logFile = this.setupLogFile();
  }

  isDebugEnabled() {
    return process.env.TALLR_DEBUG === 'true' || 
           process.env.DEBUG?.includes('tallr') || 
           process.env.NODE_ENV === 'development';
  }

  parseDebugNamespaces() {
    const debugEnv = process.env.TALLR_DEBUG_NAMESPACES || process.env.DEBUG;
    if (!debugEnv || debugEnv === 'true') {
      return new Set(['tallr:*']); // Enable all by default
    }
    return new Set(debugEnv.split(',').map(s => s.trim()));
  }

  setupLogFile() {
    try {
      const logsDir = path.join(os.homedir(), 'Library', 'Application Support', 'Tallr', 'logs');
      
      // Ensure logs directory exists
      fs.mkdirSync(logsDir, { recursive: true });
      
      const logFile = path.join(logsDir, 'cli-wrapper.log');
      
      // Test write access
      fs.appendFileSync(logFile, '');
      
      return logFile;
    } catch (error) {
      console.warn('Could not setup log file:', error.message);
      return null;
    }
  }

  shouldLog(namespace) {
    if (!this.enabled) return false;
    
    return this.namespaces.has('tallr:*') || 
           this.namespaces.has(namespace) ||
           this.namespaces.has('tallr') || // Allow 'tallr' to match all tallr:* namespaces
           Array.from(this.namespaces).some(ns => 
             ns.endsWith('*') && namespace.startsWith(ns.slice(0, -1))
           );
  }

  writeToFile(level, namespace, message, data) {
    if (!this.logFile) return;
    
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        namespace,
        message,
        data: data !== undefined ? data : null,
        pid: process.pid
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      // Silently fail - don't break CLI functionality for logging issues
      console.warn('Failed to write to log file:', error.message);
    }
  }

  log(namespace, message, data) {
    // Always write to file (for persistent logging), regardless of console debug settings
    this.writeToFile('info', namespace, message, data);
    
    if (!this.shouldLog(namespace)) return;

    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
    const prefix = `[${timestamp}] ${namespace}:`;
    
    if (data !== undefined) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  error(namespace, message, error) {
    // Always write errors to file, regardless of debug settings
    this.writeToFile('error', namespace, message, error);
    
    if (!this.shouldLog(namespace)) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] ${namespace}:`;
    
    console.error(`${prefix} ERROR: ${message}`, error || '');
  }

  warn(namespace, message, data) {
    this.writeToFile('warn', namespace, message, data);
    
    if (!this.shouldLog(namespace)) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] ${namespace}:`;
    
    console.warn(`${prefix} WARN: ${message}`, data || '');
  }

  // Quick access methods
  state(message, data) {
    this.log('tallr:state', message, data);
  }

  api(message, data) {
    this.log('tallr:api', message, data);
  }

  pattern(message, data) {
    this.log('tallr:pattern', message, data);
  }

  cli(message, data) {
    this.log('tallr:cli', message, data);
  }

  hooks(message, data) {
    this.log('tallr:hooks', message, data);
  }

  // Error convenience methods
  stateError(message, error) {
    this.error('tallr:state', message, error);
  }

  apiError(message, error) {
    this.error('tallr:api', message, error);
  }

  cliError(message, error) {
    this.error('tallr:cli', message, error);
  }

  hooksError(message, error) {
    this.error('tallr:hooks', message, error);
  }

  // Warning convenience methods
  stateWarn(message, data) {
    this.warn('tallr:state', message, data);
  }

  apiWarn(message, data) {
    this.warn('tallr:api', message, data);
  }

  cliWarn(message, data) {
    this.warn('tallr:cli', message, data);
  }
}

// Global debug instance
export const debug = new DebugLogger();

// Convenience function for creating namespaced debuggers
export function createDebugger(namespace) {
  return (message, data) => debug.log(namespace, message, data);
}