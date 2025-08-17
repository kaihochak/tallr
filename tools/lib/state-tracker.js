/**
 * Claude State Tracker
 * 
 * Manages Claude CLI state detection and transitions
 */

import { detectClaudeState, MAX_BUFFER_SIZE } from './claude-patterns.js';
import { debug } from './debug.js';
import stripAnsi from 'strip-ansi';

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
    
    // Debug data collection
    this.debugData = {
      cleanedBuffer: '',
      lastPatternTests: [],
      confidence: 'N/A',
      isActive: true
    };
    
    // Debounce buffer updates to reduce noise from rapid typing
    this.debugBufferTimeout = null;
    
    // Start debug data updates
    this.startDebugUpdates();
  }

  /**
   * Wrapper for external pattern detection (simplified 3-state system)
   * Only returns: IDLE, WORKING, PENDING
   * All error/blocked/done states are mapped to IDLE in changeState()
   */
  detectState(line, context) {
    const contextBuffer = context.recentLines.slice(-10).join(' ');
    const recentOutput = this.lastRecentOutput || '';
    
    // Use external pattern detection with full context
    const result = detectClaudeState(line, recentOutput);
    
    // Always process result since we always return a state
    
    // Update debug data if pattern tests are available
    if (result.patternTests) {
      this.debugData.lastPatternTests = result.patternTests;
    }
    
    // Return state if detected
    if (result.state) {
      this.debugData.confidence = result.confidence || 'medium';
      return { 
        state: result.state, 
        details: result.details || line, 
        confidence: result.confidence || 'medium' 
      };
    }
    
    // No automatic IDLE fallback - let pattern module handle all decisions
    // States should persist until explicit evidence of change
    return null;
  }

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
    
    // Log state transition
    debug.state('State transition', {
      taskId: this.taskId,
      from: previousState,
      to: newState,
      confidence,
      duration: now - this.lastStateChange
    });
    
    // Update Tallor backend with retry logic
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
            debug.state('Failed to update state after retries', { 
              maxRetries, 
              error: error.message, 
              taskId: this.taskId,
              fromState: previousState,
              toState: newState
            });
          }
          throw error; // Re-throw after max retries
        }
        
        // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries - 1)));
      }
    }
  }

  /**
   * Update debug buffer data (called on every data chunk)
   */
  updateDebugBuffer(recentOutput) {
    // Store the output immediately for line processing
    this.lastRecentOutput = recentOutput;
    
    // Debounce buffer cleaning to avoid showing rapid typing updates
    if (this.debugBufferTimeout) {
      clearTimeout(this.debugBufferTimeout);
    }
    
    this.debugBufferTimeout = setTimeout(() => {
      this.debugData.cleanedBuffer = stripAnsi(recentOutput.slice(-MAX_BUFFER_SIZE)).trim();
      
      if (this.debugData.cleanedBuffer) {
        this.detectState(this.debugData.cleanedBuffer, this.outputContext);
      }
    }, 500); // Wait 500ms after typing stops
  }

  /**
   * Process output line with Claude-specific detection
   */
  async processLine(line, recentOutput = '') {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Store recent output for context
    this.lastRecentOutput = recentOutput;
    
    // Update debug buffer with latest output
    this.updateDebugBuffer(recentOutput);
    
    // Add to context history
    this.outputContext.recentLines.push(trimmed);
    if (this.outputContext.recentLines.length > this.outputContext.maxHistoryLines) {
      this.outputContext.recentLines.shift();
    }
    
    // Process all lines for state detection - no filtering
    
    // State detection with improved error handling
    try {
      const detection = this.detectState(trimmed, this.outputContext);
      // Always process detection since we always return a state
      const cleanedOutput = recentOutput ? stripAnsi(recentOutput.slice(-MAX_BUFFER_SIZE)).trim() : detection.details;
      await this.changeState(detection.state, cleanedOutput, detection.confidence);
    } catch (error) {
      // Log errors using structured debug logging
      debug.state('State detection error', { error: error.message, taskId: this.taskId });
      
      // If state change fails repeatedly, fall back to IDLE to prevent stuck states
      if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        // Network error - defer state change for retry
        this.pendingStateChange = { trimmed, detection: this.detectState(trimmed, this.outputContext) };
      }
    }
  }

  /**
   * Get debug data for debugging UI
   */
  getDebugData() {
    return {
      cleanedBuffer: this.debugData.cleanedBuffer,
      patternTests: this.debugData.lastPatternTests,
      currentState: this.currentState,
      confidence: this.debugData.confidence,
      detectionHistory: this.stateHistory.slice(-10).map(entry => ({
        timestamp: Math.floor(entry.timestamp / 1000), // Convert to seconds
        from: entry.from,
        to: entry.to,
        details: entry.details,
        confidence: entry.confidence
      })),
      taskId: this.taskId,
      isActive: this.debugData.isActive
    };
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
   * Start periodic debug data updates
   */
  startDebugUpdates() {
    // Send debug data every 1 second when active
    this.debugInterval = setInterval(async () => {
      if (this.debugData.isActive) {
        try {
          await this.client.updateDebugData(this.getDebugData());
          
          // Don't send periodic state updates - only update on actual state changes
          // This was causing constant updatedAt changes and age=0m issue
        } catch (error) {
          // Silently ignore debug update errors
        }
      }
    }, 1000);
  }

  /**
   * Stop debug data updates
   */
  stopDebugUpdates() {
    if (this.debugInterval) {
      clearInterval(this.debugInterval);
      this.debugInterval = null;
    }
    
    // Mark as inactive
    this.debugData.isActive = false;
    
    // Send final update
    try {
      this.client.updateDebugData(this.getDebugData());
    } catch (error) {
      // Silently ignore
    }
  }

  /**
   * Force initial state sync
   */
  async syncInitialState() {
    if (this.currentState !== 'IDLE') {
      debug.state('Syncing initial state', { state: this.currentState, taskId: this.taskId });
      await this.client.updateTaskState(this.taskId, this.currentState, `Initial state: ${this.currentState}`);
    }
  }
}