/**
 * Claude State Tracker
 * 
 * Manages Claude CLI state detection and transitions
 */

import { detectClaudeState, cleanANSIForDisplay } from './claude-patterns.js';

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
      currentBuffer: '',
      cleanedBuffer: '',
      lastPatternTests: [],
      confidence: 'N/A',
      isActive: true
    };
    
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
    const result = detectClaudeState(line, contextBuffer, recentOutput, context.recentLines);
    
    if (!result) return null;
    
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

  // State mapping removed - using Claude states directly

  /**
   * Update state with change tracking and retry logic
   */
  async changeState(newState, details, confidence = 'medium') {
    // Map ERROR/BLOCKED states to IDLE as per simplified state system
    if (newState === 'ERROR' || newState === 'BLOCKED' || newState === 'DONE') {
      newState = 'IDLE';
    }
    
    
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
   * Update debug buffer data (called on every data chunk)
   */
  updateDebugBuffer(recentOutput) {
    // Update debug buffer data immediately
    this.debugData.currentBuffer = recentOutput.slice(-3000); // Keep last 3000 chars
    this.debugData.cleanedBuffer = cleanANSIForDisplay(this.debugData.currentBuffer);
    this.lastRecentOutput = recentOutput;
    
    // Run pattern detection on the cleaned buffer for debug purposes
    // This won't change state, just updates pattern test results
    if (this.debugData.cleanedBuffer) {
      this.detectState(this.debugData.cleanedBuffer, this.outputContext);
    }
  }

  /**
   * Process output line with Claude-specific detection
   */
  async processLine(line, recentOutput = '') {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Store recent output for context
    this.lastRecentOutput = recentOutput;
    
    // Add to context history
    this.outputContext.recentLines.push(trimmed);
    if (this.outputContext.recentLines.length > this.outputContext.maxHistoryLines) {
      this.outputContext.recentLines.shift();
    }
    
    // Only run state detection for significant lines that might indicate state changes
    const isSignificantLine = trimmed.includes('❯') || 
                             trimmed.includes('esc to interrupt') ||
                             trimmed.includes('proceed') ||
                             trimmed.includes('Yes') ||
                             trimmed.includes('No') ||
                             trimmed.length > 20; // Ignore very short lines
    
    if (!isSignificantLine) {
      return;
    }
    
    // State detection with improved error handling
    try {
      const detection = this.detectState(trimmed, this.outputContext);
      if (detection) {
        // Include cleaned recent output in the details (last 2000 chars) - preserve formatting for display
        const cleanedOutput = recentOutput ? cleanANSIForDisplay(recentOutput.slice(-2000)) : detection.details;
        await this.changeState(detection.state, cleanedOutput, detection.confidence);
      }
    } catch (error) {
      // Log errors in debug mode but prevent display interference
      if (this.enableDebug) {
        console.error(`[Tally Debug] State detection error:`, error.message);
      }
      
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
      currentBuffer: this.debugData.currentBuffer,
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
      console.log(`[Tally] Syncing initial state: ${this.currentState}`);
      await this.client.updateTaskState(this.taskId, this.currentState, `Initial state: ${this.currentState}`);
    }
  }
}