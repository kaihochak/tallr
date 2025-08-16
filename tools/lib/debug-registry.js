/**
 * Debug Registry
 * 
 * Global registry for active state trackers to provide debug data
 */

class DebugRegistry {
  constructor() {
    this.activeTrackers = new Map();
  }

  register(taskId, stateTracker) {
    this.activeTrackers.set(taskId, stateTracker);
  }

  unregister(taskId) {
    this.activeTrackers.delete(taskId);
  }

  getActiveTracker() {
    // Return the most recently registered tracker
    const trackers = Array.from(this.activeTrackers.values());
    return trackers.length > 0 ? trackers[trackers.length - 1] : null;
  }

  getAllDebugData() {
    const tracker = this.getActiveTracker();
    if (!tracker) {
      return {
        currentBuffer: 'No active CLI session',
        cleanedBuffer: 'No active CLI session',
        patternTests: [],
        currentState: 'IDLE',
        confidence: 'N/A',
        detectionHistory: [],
        taskId: 'no-active-task',
        isActive: false
      };
    }

    return tracker.getDebugData();
  }
}

// Global singleton instance
export const debugRegistry = new DebugRegistry();