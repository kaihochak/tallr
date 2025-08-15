/**
 * Claude State Tracker
 * 
 * Manages Claude CLI state detection and transitions
 */

/**
 * Clean ANSI codes from terminal output
 */
function cleanANSI(text) {
  return text
    // Remove all ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Most ANSI sequences
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, '') // OSC sequences
    .replace(/\x1b[=>]/g, '') // Application keypad
    .replace(/\x1b[()][AB012]/g, '') // Character set sequences
    // Remove control characters but keep printable Unicode
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Clean up whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ClaudeStateTracker {
  constructor(client, taskId, enableDebug = false) {
    this.client = client;
    this.taskId = taskId;
    this.enableDebug = enableDebug;
    
    // State tracking
    this.currentState = 'IDLE';
    this.lastStateChange = Date.now();
    this.stateHistory = [];
    
    // Context for pattern matching
    this.outputContext = {
      recentLines: [],
      maxHistoryLines: 50
    };
  }

  /**
   * Detect Claude state from output line (simplified 3-state system)
   */
  detectClaudeState(line, context) {
    const cleanLine = cleanANSI(line);
    if (!cleanLine || cleanLine.length < 3) return null;
    
    // PENDING: Claude is waiting for user input
    if (cleanLine.includes('❯ 1. Yes')) {
      return { state: 'PENDING', details: cleanLine, confidence: 'high' };
    }
    
    // WORKING: Claude is actively processing (more specific pattern)
    if (cleanLine.includes('esc to interrupt') && cleanLine.includes('tokens')) {
      return { state: 'WORKING', details: cleanLine, confidence: 'high' };
    }
    
    // IDLE: When Claude shows prompt or is ready for input
    if (cleanLine.includes('> ') || cleanLine.includes('⏸ plan mode') || cleanLine.includes('Welcome to Claude')) {
      return { state: 'IDLE', details: cleanLine, confidence: 'high' };
    }
    
    // Everything else stays as current state (no change)
    return null;
  }

  // State mapping removed - using Claude states directly

  /**
   * Update state with change tracking
   */
  async changeState(newState, details, confidence = 'medium') {
    if (newState === this.currentState) {
      return;
    }
    
    const previousState = this.currentState;
    const now = Date.now();
    
    // Record state change
    this.stateHistory.push({
      from: previousState,
      to: newState,
      timestamp: now,
      duration: now - this.lastStateChange,
      details: details,
      confidence: confidence
    });
    
    // Update current state
    this.currentState = newState;
    this.lastStateChange = now;
    
    // Use Claude states directly - no mapping needed
    // console.log(`[Tally] Claude: ${previousState} → ${newState}`);
    
    // Update Tally backend with Claude state directly
    await this.client.updateTaskState(this.taskId, newState, details);
  }

  /**
   * Process output line with Claude-specific detection
   */
  async processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Add to context history
    this.outputContext.recentLines.push(trimmed);
    if (this.outputContext.recentLines.length > this.outputContext.maxHistoryLines) {
      this.outputContext.recentLines.shift();
    }
    
    // State detection with error handling to prevent display interference
    try {
      const detection = this.detectClaudeState(trimmed, this.outputContext);
      if (detection) {
        await this.changeState(detection.state, detection.details, detection.confidence);
      }
    } catch (error) {
      // Silently catch any errors to prevent display interference
    }
  }

  /**
   * Get state summary for session end
   */
  getStateSummary() {
    return {
      totalStateChanges: this.stateHistory.length,
      finalState: this.currentState,
      history: this.stateHistory
    };
  }

  /**
   * Force initial state sync
   */
  async syncInitialState() {
    if (this.currentState !== 'IDLE') {
      console.log(`[Tally] Syncing initial state: ${this.currentState}`);
      await this.client.updateTaskState(this.taskId, this.currentState, `Initial state: ${this.currentState}`);
    }
  }
}