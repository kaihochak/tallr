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
    // Remove box-drawing characters
    .replace(/[│─┌┐└┘├┤┬┴┼╭╮╰╯]/g, '')
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
    
    // WORKING: Claude is actively processing (check first as most important)
    if (cleanLine.includes('esc to interrupt')) {
      return { state: 'WORKING', details: cleanLine, confidence: 'high' };
    }
    
    // PENDING: Claude is waiting for user input - check multiple patterns
    if (cleanLine.includes('❯ 1. Yes') || 
        cleanLine.includes('Would you like to proceed?') ||
        cleanLine.includes('Approve?') ||
        cleanLine.includes('[y/N]')) {
      return { state: 'PENDING', details: cleanLine, confidence: 'high' };
    }
    
    // Don't return IDLE for every line - only return state changes
    return null;
  }

  // State mapping removed - using Claude states directly

  /**
   * Update state with change tracking and retry logic
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
    
    // Update Tally backend with retry logic
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        await this.client.updateTaskState(this.taskId, newState, details);
        // Clear any pending state change on success
        this.pendingStateChange = null;
        break;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          if (this.enableDebug) {
            console.error(`[Tally Debug] Failed to update state after ${maxRetries} retries:`, error.message);
          }
          throw error; // Re-throw after max retries
        }
        
        // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries - 1)));
      }
    }
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
    
    // State detection with improved error handling
    try {
      const detection = this.detectClaudeState(trimmed, this.outputContext);
      if (detection) {
        await this.changeState(detection.state, detection.details, detection.confidence);
      }
    } catch (error) {
      // Log errors in debug mode but prevent display interference
      if (this.enableDebug) {
        console.error(`[Tally Debug] State detection error:`, error.message);
      }
      
      // If state change fails repeatedly, fall back to IDLE to prevent stuck states
      if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        // Network error - defer state change for retry
        this.pendingStateChange = { trimmed, detection: this.detectClaudeState(trimmed, this.outputContext) };
      }
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