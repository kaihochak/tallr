/**
 * Node.js Debug Utility for CLI Wrapper
 * 
 * Simple structured logging for the CLI wrapper components
 */

class DebugLogger {
  constructor() {
    this.enabled = this.isDebugEnabled();
    this.namespaces = this.parseDebugNamespaces();
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

  shouldLog(namespace) {
    if (!this.enabled) return false;
    
    return this.namespaces.has('tallr:*') || 
           this.namespaces.has(namespace) ||
           this.namespaces.has('tallr') || // Allow 'tallr' to match all tallr:* namespaces
           Array.from(this.namespaces).some(ns => 
             ns.endsWith('*') && namespace.startsWith(ns.slice(0, -1))
           );
  }

  log(namespace, message, data) {
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
    if (!this.shouldLog(namespace)) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] ${namespace}:`;
    
    console.error(`${prefix} ERROR: ${message}`, error || '');
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
}

// Global debug instance
export const debug = new DebugLogger();

// Convenience function for creating namespaced debuggers
export function createDebugger(namespace) {
  return (message, data) => debug.log(namespace, message, data);
}