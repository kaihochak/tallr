import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { debug } from './debug.js';
import { showNetworkDetectionStatus } from './status-indicator.js';

/**
 * Set up network listener for launcher spy messages
 * Uses @happy-coder's exact approach with createInterface for fd 3 reading
 * Phase 3: Enhanced with PENDING state detection
 */
export function setupNetworkListener(childProcess, stateTracker, taskId) {
  // Track active fetches for thinking state (@happy-coder's approach)
  const activeFetches = new Map();
  // Phase 3: Track pending state
  let isPending = false;
  
  // Listen to the custom fd (fd 3) line by line (@happy-coder's exact code)
  if (childProcess.stdio[3]) {
    const rl = createInterface({
      input: childProcess.stdio[3],
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        
        switch (message.type) {
          case 'fetch-start':
            activeFetches.set(message.id, {
              hostname: message.hostname,
              path: message.path,
              startTime: message.timestamp
            });
            debug.network('Network request started:', { 
              id: message.id, 
              hostname: message.hostname,
              path: message.path 
            });
            stateTracker.changeState('WORKING', 'Claude is thinking...', 'high', 'network');
            break;
            
          case 'fetch-end':
            activeFetches.delete(message.id);
            debug.network('Network request ended:', { 
              id: message.id, 
              active: activeFetches.size 
            });
            
            // @happy-coder's 500ms debouncing to avoid flickering
            if (activeFetches.size === 0) {
              setTimeout(() => {
                if (activeFetches.size === 0) {
                  debug.network('All requests complete, transitioning to IDLE');
                  stateTracker.changeState('IDLE', 'Ready for input', 'high', 'network');
                }
              }, 500);
            }
            break;

          case 'permission-prompt':
            // Early hint: assistant is asking for permission before canCallTool
            isPending = true;
            debug.network('Permission prompt detected (early PENDING):', {
              preview: (message.text || '').slice(0, 120)
            });
            stateTracker.changeState('PENDING', 'Claude is asking for permission', 'high', 'network');
            break;

          case 'permission-request':
            // New Phase 3 event: canCallTool fired in launcher
            isPending = true;
            debug.network('Permission request received:', {
              id: message.id,
              tool: message.tool?.name,
              argsPreview: message.tool?.args ? JSON.stringify(message.tool.args).slice(0, 200) : undefined
            });
            stateTracker.changeState('PENDING', 'Claude needs permission for tools', 'high', 'network');
            break;

          case 'claude-message':
            // Forward conversation message to backend for UI rendering
            try {
              const details = JSON.stringify({
                type: 'conversation-message',
                role: message.role || 'assistant',
                text: message.text || '',
                timestamp: message.timestamp || Date.now()
              });
              if (stateTracker && stateTracker.client && typeof stateTracker.client.updateTaskDetails === 'function') {
                stateTracker.client.updateTaskDetails(taskId, details).catch(() => {});
              }
            } catch (e) {
              // Ignore forwarding errors
            }
            break;
            
          case 'pending-detected':
            isPending = true;
            debug.network('PENDING state detected:', { 
              id: message.id, 
              reason: message.reason 
            });
            stateTracker.changeState('PENDING', 'Claude needs permission for tools', 'high', 'network');
            break;
            
          // Phase 3 cases will be added here when we implement
          // the canCallTool callback approach
            
          default:
            debug.network('Unknown network message type:', message.type);
            break;
        }
      } catch (error) {
        // Ignore malformed JSON messages (but log for debugging)
        debug.network('Failed to parse network spy message:', line);
      }
    });
    
    rl.on('error', (error) => {
      debug.cliError('Network spy readline error:', error);
    });
    
    debug.network('Network detection listener established on fd 3');
  } else {
    debug.cliError('fd 3 not available for network detection - launcher may have failed');
  }
}

/**
 * Attempt to start network detection launcher for supported agents
 * Uses @happy-coder's exact approach: regular spawn with fd 3 pipe
 */
export async function tryNetworkLauncher(command, commandArgs, config, taskId, stateTracker) {
  // Check if agent supports launcher (currently: claude)
  const hasLauncher = command === 'claude';
  
  if (!hasLauncher) {
    return false; // No launcher support, use fallback
  }
  
  debug.cli('Attempting network detection launcher for', command);
  
  try {
    // @happy-coder's exact approach: regular spawn with fd 3 pipe
    const launcherPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'claude-launcher.cjs');
    
    const useSdk = process.env.TALLR_SDK_MODE === 'true' || process.env.TALLR_SDK_MODE === '1' || commandArgs.includes('--sdk');
    const childProcess = spawn('node', [launcherPath, ...commandArgs], {
      stdio: useSdk ? ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] : ['inherit', 'inherit', 'inherit', 'pipe'],
      cwd: process.cwd(),
      env: { 
        ...process.env,
        TALLR_TASK_ID: taskId,
        TALLR_TOKEN: config.token
      }
    });
    
    // Set up network listener using @happy-coder's approach
    setupNetworkListener(childProcess, stateTracker, taskId);
    
    debug.cli('Network detection launcher started successfully');
    
    // Show user-friendly status indicator
    showNetworkDetectionStatus(command);
    
    // Handle process events
    childProcess.on('exit', (code, signal) => {
      debug.cli('Launcher process exited', { code, signal });
    });
    
    childProcess.on('error', (error) => {
      debug.cliError('Launcher process error:', error);
    });
    
    return true; // Success - launcher is active
    
  } catch (error) {
    debug.cliError('Launcher failed, falling back to pattern detection:', error);
    return false; // Failed - use fallback
  }
}
