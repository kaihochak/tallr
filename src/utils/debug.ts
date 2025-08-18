/**
 * Structured Debug Logging Utility
 * 
 * Provides developer-friendly debugging with namespaces and environment control
 */

type DebugNamespace = 'tallr:state' | 'tallr:api' | 'tallr:pattern' | 'tallr:ui' | 'tallr:cli';

interface DebugConfig {
  enabled: boolean;
  namespaces: Set<string>;
  colors: Record<string, string>;
}

class DebugLogger {
  private config: DebugConfig;

  constructor() {
    this.config = {
      enabled: this.isDebugEnabled(),
      namespaces: this.parseDebugNamespaces(),
      colors: {
        'tallr:state': '#4CAF50',   // Green
        'tallr:api': '#2196F3',     // Blue  
        'tallr:pattern': '#FF9800', // Orange
        'tallr:ui': '#9C27B0',      // Purple
        'tallr:cli': '#795548',     // Brown
      }
    };
  }

  private isDebugEnabled(): boolean {
    if (typeof window !== 'undefined') {
      // Frontend - check for development mode or localStorage
      return import.meta.env.DEV || localStorage.getItem('tallr-debug') === 'true';
    } else {
      // Node.js - check environment variables
      return process.env.TALLR_DEBUG === 'true' || 
             process.env.DEBUG?.includes('tallr') || 
             process.env.NODE_ENV === 'development';
    }
  }

  private parseDebugNamespaces(): Set<string> {
    const debugEnv = typeof window !== 'undefined' 
      ? localStorage.getItem('tallr-debug-namespaces')
      : process.env.TALLR_DEBUG_NAMESPACES || process.env.DEBUG;

    if (!debugEnv || debugEnv === 'true') {
      return new Set(['tallr:*']); // Enable all by default
    }

    return new Set(debugEnv.split(',').map(s => s.trim()));
  }

  private shouldLog(namespace: string): boolean {
    if (!this.config.enabled) return false;
    
    return this.config.namespaces.has('tallr:*') || 
           this.config.namespaces.has(namespace) ||
           Array.from(this.config.namespaces).some(ns => 
             ns.endsWith('*') && namespace.startsWith(ns.slice(0, -1))
           );
  }

  private formatMessage(namespace: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
    const prefix = `[${timestamp}] ${namespace}:`;
    
    if (data !== undefined) {
      return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  log(namespace: DebugNamespace, message: string, data?: any): void {
    if (!this.shouldLog(namespace)) return;

    const formattedMessage = this.formatMessage(namespace, message, data);
    const color = this.config.colors[namespace] || '#666666';

    if (typeof window !== 'undefined') {
      // Frontend - styled console output
      console.log(
        `%c${formattedMessage}`,
        `color: ${color}; font-weight: bold;`
      );
    } else {
      // Node.js - plain console output (could add chalk colors later)
      console.log(formattedMessage);
    }
  }

  error(namespace: DebugNamespace, message: string, error?: Error): void {
    if (!this.shouldLog(namespace)) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] ${namespace}:`;
    
    console.error(`${prefix} ERROR: ${message}`, error || '');
  }

  // Quick access methods for common namespaces
  state(message: string, data?: any): void {
    this.log('tallr:state', message, data);
  }

  api(message: string, data?: any): void {
    this.log('tallr:api', message, data);
  }

  pattern(message: string, data?: any): void {
    this.log('tallr:pattern', message, data);
  }

  ui(message: string, data?: any): void {
    this.log('tallr:ui', message, data);
  }

  cli(message: string, data?: any): void {
    this.log('tallr:cli', message, data);
  }

  // Debug state management
  enable(): void {
    this.config.enabled = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem('tallr-debug', 'true');
    }
  }

  disable(): void {
    this.config.enabled = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tallr-debug');
    }
  }

  setNamespaces(namespaces: string[]): void {
    this.config.namespaces = new Set(namespaces);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tallr-debug-namespaces', namespaces.join(','));
    }
  }

  // Get current debug state for copying/sharing
  getDebugState(): object {
    return {
      enabled: this.config.enabled,
      namespaces: Array.from(this.config.namespaces),
      timestamp: new Date().toISOString()
    };
  }
}

// Global debug instance
export const debug = new DebugLogger();

// Convenience function for quick debugging
export function createDebugger(namespace: DebugNamespace) {
  return (message: string, data?: any) => debug.log(namespace, message, data);
}

// Make debug available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).tallrDebug = debug;
}