#!/usr/bin/env node

import pty from 'node-pty';
import { TallrClient } from './lib/http-client.js';
import { StateTracker } from './lib/state-tracker.js';
import { getIdeCommand, promptForIdeCommand } from './lib/settings.js';
import { MAX_BUFFER_SIZE } from './lib/patterns.js';
import { debug } from './lib/debug.js';
import { showLogo } from './logo.js';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

const IDE_MAPPINGS = {
  'Visual Studio Code': 'code',
  'Code': 'code',
  'Cursor': 'cursor', 
  'Windsurf': 'windsurf',
  'WebStorm': 'webstorm',
  'IntelliJ IDEA': 'idea',
  'PyCharm': 'pycharm',
  'PhpStorm': 'phpstorm',
  'RubyMine': 'rubymine',
  'CLion': 'clion',
  'GoLand': 'goland',
  'Rider': 'rider',
  'Zed': 'zed',
  'Xcode': 'xcode'
};

function detectCurrentIDE() {
  try {
    if (process.env.VSCODE_INJECTION === '1' || process.env.TERM_PROGRAM === 'vscode') {
      return getIdeCommand('Visual Studio Code', 'code');
    }
    if (process.env.CURSOR_AGENT || process.env.TERM_PROGRAM === 'cursor') {
      return getIdeCommand('Cursor', 'cursor');
    }
    
    const ppid = process.ppid;
    if (ppid) {
      try {
        const parentName = execSync(`ps -p ${ppid} -o comm=`, { encoding: 'utf8' }).trim();
        
        const userCommand = getIdeCommand(parentName);
        if (userCommand) {
          return userCommand;
        }
        
        if (IDE_MAPPINGS[parentName]) {
          return getIdeCommand(parentName, IDE_MAPPINGS[parentName]);
        }
        
        for (const [appName, command] of Object.entries(IDE_MAPPINGS)) {
          if (parentName.toLowerCase().includes(appName.toLowerCase()) || 
              appName.toLowerCase().includes(parentName.toLowerCase())) {
            return getIdeCommand(parentName, command);
          }
        }
        
        const fallbackCommand = promptForIdeCommand(parentName);
        return fallbackCommand;
      } catch {
      }
    }
  } catch {
  }
  
  return null;
}


// Get auth token from file or environment
function getAuthToken() {
  // Check environment variables first (highest priority)
  if (process.env.TALLR_TOKEN) {
    return process.env.TALLR_TOKEN;
  }
  
  // Try to read from auth token file (same location as Rust backend)
  try {
    const appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Tallr');
    const tokenFile = path.join(appDataDir, 'auth.token');
    
    if (fs.existsSync(tokenFile)) {
      const token = fs.readFileSync(tokenFile, 'utf8').trim();
      if (token) {
        return token;
      }
    }
  } catch (error) {
    console.error('[CLI AUTH] ❌ Failed to read auth token file:', error.message);
    if (process.env.DEBUG) {
      console.error('[CLI AUTH] Full error details:', error);
    }
  }
  
  // No fallback - authentication required
  throw new Error('Authentication required. Please start the Tallr application first.');
}

// Simple gateway detection for Tallr backend
function detectTallrGateway() {
  if (process.env.TALLR_GATEWAY) {
    return process.env.TALLR_GATEWAY;
  }
  
  // Use consistent port 4317 for both dev and prod
  return 'http://127.0.0.1:4317';
}

const config = {
  token: getAuthToken(),
  gateway: detectTallrGateway(),
  project: process.env.TL_PROJECT || 'default-project',
  repo: process.env.TL_REPO || process.cwd(),
  agent: process.env.TL_AGENT || 'cli',
  title: process.env.TL_TITLE || 'CLI Task',
  ide: process.env.TL_IDE || detectCurrentIDE()
};

const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Set environment variable for hooks
process.env.TALLR_TASK_ID = taskId;

// Log CLI wrapper startup
debug.cli('Starting CLI wrapper', {
  taskId,
  agent: config.agent,
  project: config.project,
  repo: config.repo,
  gateway: config.gateway,
  pid: process.pid,
  args: process.argv
});

const client = new TallrClient(config);
const stateTracker = new StateTracker(client, taskId, config.agent, true); // Enable debug mode

// Start health pings IMMEDIATELY - before any other operations
client.startHealthPings(10000); // Ping every 10 seconds

function restoreTerminal() {
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

async function updateTaskAndCleanup(state, details) {
  stateTracker.stopDebugUpdates();
  client.stopHealthPings();
  await client.updateTaskState(taskId, state, details);
}

/**
 * Set up network listener for launcher spy messages
 * Uses @happy-coder's approach with createInterface for fd 3 reading
 */
function setupNetworkListener(childProcess) {
  // Track active fetches for thinking state (@happy-coder's approach)
  const activeFetches = new Map();

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
 * Main process spawning - tries launcher first for Claude, falls back to PTY + patterns
 */
async function runWithPTY(command, commandArgs) {
  // Try network detection launcher first for Claude (default behavior)
  if (command === 'claude') {
    debug.cli('Attempting network detection launcher for', command);

    try {
      // @happy-coder's exact approach: regular spawn with fd 3 pipe
      const launcherPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'lib', 'claude-launcher.cjs');

      const childProcess = spawn('node', [launcherPath, ...commandArgs], {
        stdio: ['inherit', 'inherit', 'inherit', 'pipe'], // fd 3 for spy messages
        cwd: process.cwd(),
        env: {
          ...process.env,
          TALLR_TASK_ID: taskId,
          TALLR_TOKEN: config.token
        }
      });

      // Set up network listener using @happy-coder's approach
      setupNetworkListener(childProcess);

      debug.cli('Network detection launcher started successfully');

      // Handle process events
      childProcess.on('exit', async (code, signal) => {
        const success = code === 0;
        const details = success
          ? `Claude session completed successfully`
          : `Claude session ended with code ${code}`;

        debug.cli('Launcher process exited', { code, signal, success });
        await updateTaskAndCleanup(success ? 'DONE' : 'IDLE', details);
        process.exit(code);
      });

      childProcess.on('error', async (error) => {
        debug.cliError('Launcher process error:', error);
        await updateTaskAndCleanup('ERROR', `Launcher error: ${error.message}`);
        process.exit(1);
      });

      // Set up cleanup handlers
      const cleanup = async (signal, exitCode) => {
        try {
          if (childProcess && !childProcess.killed) {
            childProcess.kill(signal);
          }
          await updateTaskAndCleanup('CANCELLED', `Session ${signal.toLowerCase()}`);
        } catch (cleanupError) {
          debug.cliError('Cleanup error:', cleanupError);
        } finally {
          process.exit(exitCode);
        }
      };

      process.on('SIGINT', () => cleanup('SIGINT', 130));
      process.on('SIGTERM', () => cleanup('SIGTERM', 143));

      return; // Success - exit early, network detection is active

    } catch (error) {
      debug.cliError('Launcher failed, falling back to pattern detection:', error);
      // Fall through to PTY + pattern detection
    }
  }

  // Fallback: PTY + pattern detection (original approach)
  debug.cli('Using PTY + pattern detection for', command);
  const ptyProcess = pty.spawn(command, commandArgs, {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: { 
      ...process.env,
      TALLR_TASK_ID: taskId,  // Ensure task ID is available to child process
      TALLR_TOKEN: config.token  // Pass auth token to child process for hooks
    }
  });

  // Terminal resize handling
  let resizeTimeout;
  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (ptyProcess && !ptyProcess.killed) {
        const cols = process.stdout.columns || 80;
        const rows = process.stdout.rows || 30;
        debug.cli('Terminal resized, updating PTY', { cols, rows });
        try {
          ptyProcess.resize(cols, rows);
        } catch (error) {
          debug.cliError('Failed to resize PTY', error);
        }
      }
    }, 100); // Debounce resize events by 100ms
  };

  // Listen for terminal resize events
  process.stdout.on('resize', handleResize);
  
  // Ensure SIGWINCH is handled (required for resize events to work properly)
  process.on('SIGWINCH', () => {
    // This ensures the 'resize' event fires properly on stdout
  });

  // Single entry point for all PTY data processing
  ptyProcess.on('data', (data) => {
    process.stdout.write(data);
    stateTracker.handlePtyData(data);
  });

  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      ptyProcess.write(data);
    });
  }

  ptyProcess.on('exit', async (code, signal) => {
    const success = code === 0;
    const details = success 
      ? `Claude session completed successfully` 
      : `Claude session ended with code ${code}`;

    debug.cli('PTY process exited', { code, signal, success });
    
    // Clean up resize listeners
    clearTimeout(resizeTimeout);
    process.stdout.removeListener('resize', handleResize);
    
    await updateTaskAndCleanup(success ? 'DONE' : 'IDLE', details);
    restoreTerminal();
    process.exit(code);
  });

  ptyProcess.on('error', async (error) => {
    debug.cliError('PTY process error', error);
    console.error(`\n[Tallr] PTY error:`, error.message);
    
    // Clean up resize listeners
    clearTimeout(resizeTimeout);
    process.stdout.removeListener('resize', handleResize);
    
    try {
      restoreTerminal();
      await updateTaskAndCleanup('ERROR', `PTY error: ${error.message}`);
    } catch (cleanupError) {
      console.error(`[Tallr] Cleanup error:`, cleanupError.message);
    }
    
    const exitCode = error.code === 'ENOENT' ? 127 : 1;
    process.exit(exitCode);
  });

  const cleanup = async (signal, exitCode) => {
    
    // Clean up resize listeners
    clearTimeout(resizeTimeout);
    process.stdout.removeListener('resize', handleResize);
    
    try {
      if (ptyProcess && !ptyProcess.killed) {
        ptyProcess.kill(signal);
      }
      restoreTerminal();
      await updateTaskAndCleanup('CANCELLED', `Interactive session ${signal.toLowerCase()}`);
    } catch (cleanupError) {
      console.error(`[Tallr] Cleanup error:`, cleanupError.message);
    } finally {
      process.exit(exitCode);
    }
  };

  process.on('SIGINT', () => cleanup('SIGINT', 130));
  process.on('SIGTERM', () => cleanup('SIGTERM', 143));
}

/**
 * Main execution with robust error handling
 */
async function main() {
  let taskCreated = false;
  
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.error('Usage: node tl-wrap.js <command> [args...]');
      process.exit(1);
    }

    // Show logo on startup
    showLogo();

    const [command, ...commandArgs] = args;
    debug.cli('Executing command', { command, args: commandArgs });

    try {
      await client.createTask(taskId);
      taskCreated = true;
      debug.api('Task created successfully', { taskId });
    } catch (error) {
      debug.apiError('Failed to create task, continuing without tracking', error);
    }
    
    if (taskCreated) {
      await stateTracker.syncInitialState();
      debug.state('Initial state synced');
    }

    await runWithPTY(command, commandArgs);
    
  } catch (error) {
    debug.cliError('Wrapper error', error);
    console.error('[Tallr] Wrapper error:', error.message);
    
    if (taskCreated) {
      try {
        await client.updateTaskState(taskId, 'ERROR', `Wrapper error: ${error.message}`);
        debug.api('Task marked as ERROR due to wrapper error');
      } catch (cleanupError) {
        debug.apiError('Failed to update task state during error cleanup', cleanupError);
      }
    }
    
    process.exit(1);
  }
}

/**
 * Global error handlers for unhandled errors
 */
process.on('uncaughtException', async (error) => {
  console.error('[Tallr] Uncaught exception:', error.message);
  try {
    await client.updateTaskState(taskId, 'ERROR', `Uncaught exception: ${error.message}`);
  } catch {
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Tallr] Unhandled promise rejection:', reason);
  try {
    await client.updateTaskState(taskId, 'ERROR', `Unhandled rejection: ${reason}`);
  } catch {
  }
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[Tallr] Fatal wrapper error:', error.message);
    process.exit(1);
  });
}

export { 
  config,
  client,
  stateTracker,
  runWithPTY
};
