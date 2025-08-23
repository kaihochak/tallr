#!/usr/bin/env node

import pty from 'node-pty';
import { TallrClient } from './lib/http-client.js';
import { ClaudeStateTracker } from './lib/state-tracker.js';
import { getIdeCommand, promptForIdeCommand } from './lib/settings.js';
import { MAX_BUFFER_SIZE } from './lib/patterns.js';
import { debug } from './lib/debug.js';
import { showLogo } from './logo.js';
import { execSync } from 'child_process';
import http from 'http';
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

// Simple dev-only gateway for testing
function detectTallrGateway() {
  if (process.env.TALLR_GATEWAY) {
    return process.env.TALLR_GATEWAY;
  }
  
  // For now, always use dev port 4317
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
const stateTracker = new ClaudeStateTracker(client, taskId, config.agent, true); // Enable debug mode

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
 * PTY approach for interactive CLIs - minimal passthrough
 */
async function runWithPTY(command, commandArgs) {
  const ptyProcess = pty.spawn(command, commandArgs, {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: process.env
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

    // Health pings already started at file initialization

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
