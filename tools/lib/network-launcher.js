import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import fs from 'fs';
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

    // Set up hook IPC monitoring for launcher mode
    const ipcFile = path.join(process.cwd(), '.tallr-session-ipc');
    const setupHookIPC = () => {
      try {
        fs.writeFileSync(ipcFile, '');
        debug.cli('Created IPC file for hook communication in launcher mode:', ipcFile);

        const watcher = fs.watchFile(ipcFile, { interval: 100 }, () => {
          try {
            const content = fs.readFileSync(ipcFile, 'utf8').trim();
            if (!content) return;

            const lines = content.split('\n').filter(line => line.trim());
            for (const line of lines) {
              try {
                const message = JSON.parse(line);
                if (message.type === 'state') {
                  debug.cli('Hook IPC message received in launcher mode:', message);
                  stateTracker.changeState(message.state, message.details, 'high', 'hook');
                }
              } catch (e) {
                debug.cliError('Invalid hook IPC message:', line);
              }
            }

            fs.writeFileSync(ipcFile, '');
          } catch (error) {
            debug.cliError('Error reading hook IPC file in launcher mode:', error);
          }
        });

        return watcher;
      } catch (error) {
        debug.cliError('Failed to set up IPC in launcher mode:', error);
        return null;
      }
    };

    const ipcWatcher = setupHookIPC();

    debug.cli('Network detection launcher started successfully');
    
    // Show user-friendly status indicator
    showNetworkDetectionStatus(command);
    
    // Set up proper signal handling for cleanup
    const cleanup = async (signal, exitCode) => {
      debug.cli('Cleaning up network launcher process', { signal });
      try {
        if (childProcess && !childProcess.killed) {
          childProcess.kill(signal);
        }
      } catch (error) {
        debug.cliError('Error killing launcher process:', error);
      }

      // Clean up IPC
      if (ipcWatcher) {
        try {
          fs.unwatchFile(ipcFile);
          fs.unlinkSync(ipcFile);
          debug.cli('Cleaned up IPC file in launcher mode');
        } catch (e) {
          debug.cliError('Error cleaning up IPC in launcher mode:', e);
        }
      }

      process.exit(exitCode);
    };

    // Forward signals to child process
    process.on('SIGINT', () => cleanup('SIGINT', 130));
    process.on('SIGTERM', () => cleanup('SIGTERM', 143));

    // Handle process events
    childProcess.on('exit', (code, signal) => {
      debug.cli('Launcher process exited', { code, signal });

      // Clean up IPC
      if (ipcWatcher) {
        try {
          fs.unwatchFile(ipcFile);
          fs.unlinkSync(ipcFile);
          debug.cli('Cleaned up IPC file on launcher exit');
        } catch (e) {
          debug.cliError('Error cleaning up IPC on launcher exit:', e);
        }
      }

      // Exit with same code as child
      process.exit(code || 0);
    });

    childProcess.on('error', (error) => {
      debug.cliError('Launcher process error:', error);

      // Clean up IPC
      if (ipcWatcher) {
        try {
          fs.unwatchFile(ipcFile);
          fs.unlinkSync(ipcFile);
          debug.cli('Cleaned up IPC file on launcher error');
        } catch (e) {
          debug.cliError('Error cleaning up IPC on launcher error:', e);
        }
      }

      process.exit(1);
    });

    // Keep the main process alive while child runs
    // This replaces the immediate return true
    return new Promise((resolve) => {
      // Process will exit via childProcess.on('exit') or signal handlers
      // This ensures we don't return control until the session is complete
    });
    
  } catch (error) {
    debug.cliError('Launcher failed, falling back to pattern detection:', error);
    return false; // Failed - use fallback
  }
}
