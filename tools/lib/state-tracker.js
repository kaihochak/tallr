/**
 * State Tracker
 * 
 * Manages AI CLI state detection and transitions for multiple agents
 */

import { detectState, MAX_BUFFER_SIZE } from './patterns.js';
import { hasClaudeCodeHooks } from './hooks-detector.js';
import { debug } from './debug.js';
import stripAnsi from 'strip-ansi';

export class StateTracker {
  constructor(client, taskId, agent, enableDebug = false) {
    this.client = client;
    this.taskId = taskId;
    this.agent = (agent && typeof agent === 'string') ? agent.toLowerCase() : 'claude';
    this.enableDebug = enableDebug;
    
    // Hook configuration tracking
    this.hooksAvailable = hasClaudeCodeHooks();
    
    // Log hook availability with more detail
    debug.hooks(`State tracker initialized - hooks ${this.hooksAvailable ? 'configured' : 'not configured'}`, {
      taskId: this.taskId,
      agent: this.agent,
      hooksAvailable: this.hooksAvailable
    });
    
    // State tracking
    this.currentState = 'IDLE';
    this.lastStateChange = Date.now();
    this.stateHistory = [];
    
    // State persistence tracking
    this.lastWorkingDetection = 0;
    this.lastPendingDetection = 0;
    
    // Unified buffer for all data
    this.rawBuffer = '';
    this.cleanBuffer = '';
    
    // Timers
    this.detailsUpdateTimeout = null;
    
    // Debug data collection
    this.debugData = {
      lastPatternTests: [],
      confidence: 'N/A',
      isActive: true
    };
  }

  /**
   * Determine if IDLE transition should be accepted with simplified logic
   */
  shouldAcceptIdleTransition(idleConfidence) {
    // Always accept high-confidence IDLE immediately
    if (idleConfidence === 'high') {
      return true;
    }
    
    // Accept medium-confidence IDLE immediately too (improved from pattern detection)
    if (idleConfidence === 'medium') {
      return true;
    }
    
    // If currently in IDLE, accept any IDLE detection (maintain state)
    if (this.currentState === 'IDLE') {
      return true;
    }
    
    // For WORKING/PENDING states with low confidence IDLE, use shorter timeout
    const now = Date.now();
    const IDLE_TRANSITION_DELAY = 1500; // 1.5 seconds - much more responsive
    
    if (this.currentState === 'WORKING') {
      const timeSinceLastWorking = now - this.lastWorkingDetection;
      return timeSinceLastWorking > IDLE_TRANSITION_DELAY;
    }
    
    if (this.currentState === 'PENDING') {
      const timeSinceLastPending = now - this.lastPendingDetection;
      return timeSinceLastPending > IDLE_TRANSITION_DELAY;
    }
    
    // Default: accept IDLE transition
    return true;
  }

  /**
   * Send debug data update immediately (called when state detection runs)
   */
  async updateDebugData() {
    if (this.debugData.isActive) {
      try {
        const debugData = this.getDebugData();
        await this.client.updateDebugData(debugData);
      } catch (error) {
        // Silently ignore debug update errors
      }
    }
  }

  /**
   * Update state with smart cooldowns
   */
  async changeState(newState, details, confidence = 'medium', detectionMethod = 'patterns') {
    debug.state('changeState called', {
      from: this.currentState,
      to: newState,
      detectionMethod,
      confidence
    });
    
    if (newState === this.currentState) {
      debug.state('changeState: no change needed', { currentState: this.currentState, newState });
      return;
    }
    
    // Smart cooldowns based on transition type
    const timeSinceLastChange = Date.now() - this.lastStateChange;
    const previousState = this.currentState;
    
    let requiredCooldown;
    if (newState === 'PENDING' || newState === 'WORKING') {
      // Fast entry into active states
      requiredCooldown = 500; // 0.5 seconds
    } else if (previousState === 'PENDING' || previousState === 'WORKING') {
      // Slower exit from active states
      requiredCooldown = 1000; // 1 second
    } else {
      // Regular transitions
      requiredCooldown = 1000; // 1 second
    }
    
    if (timeSinceLastChange < requiredCooldown) {
      debug.state('changeState: blocked by cooldown', { 
        timeSinceLastChange, 
        requiredCooldown,
        from: previousState,
        to: newState 
      });
      return; // Respect cooldown
    }
    
    const now = Date.now();
    
    // Record state change
    const stateEntry = {
      from: previousState,
      to: newState,
      timestamp: now,
      duration: now - this.lastStateChange,
      details: details,
      confidence: confidence,
      detectionMethod: detectionMethod
    };
    
    this.stateHistory.push(stateEntry);
    
    debug.state('changeState: state change recorded', {
      entry: stateEntry,
      historyLength: this.stateHistory.length
    });
    
    // Update current state
    this.currentState = newState;
    this.lastStateChange = now;
    
    
    try {
      await this.client.updateTaskState(this.taskId, newState, details);
    } catch (error) {
      // Intentionally ignore backend communication errors to prevent CLI disruption
    }
  }

  /**
   * Main entry point for PTY data - simplified unified processing
   */
  handlePtyData(data) {
    // Debug output to log file (won't interfere with CLI)
    debug.state('handlePtyData received', { 
      length: data.length,
      preview: data.slice(0, 50).replace(/\n/g, '\\n')
    });

    // 1. Accumulate raw data
    this.rawBuffer += data;
    if (this.rawBuffer.length > MAX_BUFFER_SIZE) {
      this.rawBuffer = this.rawBuffer.slice(-MAX_BUFFER_SIZE);
    }
    
    // 2. Update clean buffer for state detection and display
    this.cleanBuffer = stripAnsi(this.rawBuffer).trim();
    
    // 3. Update displays with debouncing
    this.updateDisplays();
    
    // 4. Check for state changes using clean buffer
    this.checkForStateChanges();
  }

  /**
   * Update real-time displays with debouncing
   */
  updateDisplays() {
    // Debounced task details updates for real-time display
    if (this.detailsUpdateTimeout) {
      clearTimeout(this.detailsUpdateTimeout);
    }
    
    this.detailsUpdateTimeout = setTimeout(() => {
      if (this.cleanBuffer) {
        this.client.updateTaskDetails(this.taskId, this.cleanBuffer).catch(() => {});
      }
    }, 500);
  }

  /**
   * Check for state changes using unified clean buffer
   */
  checkForStateChanges() {
    if (!this.cleanBuffer.trim()) {
      return;
    }
    
    // Get the last line for current state detection
    const lines = this.cleanBuffer.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return;
    }
    
    const lastLine = lines[lines.length - 1];
    
    // When hooks are available, we still run pattern detection for debug data
    // but state transitions should primarily come from hooks (via HTTP calls)
    if (this.hooksAvailable) {
      debug.hooks('Processing pattern detection for debug data (hooks active)', {
        detectionMethod: this.detectionMethod
      });
    }
    
    this.processStateDetection(lastLine);
  }


  /**
   * Process state detection - unified logic for both debug and state changes
   */
  async processStateDetection(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    debug.state('processStateDetection called', {
      line: trimmed.substring(0, 100), // First 100 chars
      agent: this.agent,
      currentState: this.currentState
    });
    
    try {
      // Single detectState call (agent-aware) for both state change and debug
      const detection = detectState(this.agent, trimmed, this.cleanBuffer);
      
      debug.state('detectState result', {
        detection,
        hasState: !!detection?.state
      });
      
      // Store debug data from SAME detection call
      if (detection.patternTests) {
        this.debugData.lastPatternTests = detection.patternTests;
      }
      this.debugData.confidence = detection.confidence || 'medium';
      
      // Track when active state patterns were last detected
      const now = Date.now();
      if (detection && detection.state === 'WORKING') {
        this.lastWorkingDetection = now;
      }
      if (detection && detection.state === 'PENDING') {
        this.lastPendingDetection = now;
      }
      
      // Update debug data immediately 
      this.updateDebugData();
      
      // Process state changes with enhanced persistence logic
      if (detection && detection.state) {
        const recentContext = this.cleanBuffer.split('\n').slice(-5).join('\n') || trimmed;
        
        // Streamlined state transition logic
        if (detection.state === 'IDLE') {
          const shouldAccept = this.shouldAcceptIdleTransition(detection.confidence);
          debug.state('IDLE transition decision', {
            confidence: detection.confidence,
            currentState: this.currentState,
            shouldAccept,
            timeSinceLastWorking: this.currentState === 'WORKING' ? Date.now() - this.lastWorkingDetection : 'N/A',
            timeSinceLastPending: this.currentState === 'PENDING' ? Date.now() - this.lastPendingDetection : 'N/A'
          });
          
          if (shouldAccept) {
            await this.changeState(detection.state, recentContext, detection.confidence, 'patterns');
          }
        } else {
          // Always accept non-IDLE state changes (WORKING/PENDING)
          await this.changeState(detection.state, recentContext, detection.confidence, 'patterns');
        }
      }
    } catch (error) {
    }
  }

  /**
   * Get debug data for debugging UI
   */
  getDebugData() {
    return {
      cleanedBuffer: this.cleanBuffer, // Use unified clean buffer
      currentState: this.currentState,
      detectionHistory: this.stateHistory.slice(-10).map(entry => ({
        timestamp: Math.floor(entry.timestamp / 1000), // Convert to seconds
        from: entry.from,
        to: entry.to,
        details: entry.details,
        confidence: entry.confidence,
        detectionMethod: entry.detectionMethod
      })),
      taskId: this.taskId,
      patternTests: this.debugData.lastPatternTests,
      confidence: this.debugData.confidence,
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
   * Stop debug data updates
   */
  stopDebugUpdates() {
    // Clear pending details update timeout
    if (this.detailsUpdateTimeout) {
      clearTimeout(this.detailsUpdateTimeout);
      this.detailsUpdateTimeout = null;
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
      await this.client.updateTaskState(this.taskId, this.currentState, `Initial state: ${this.currentState}`);
    }
  }
}
