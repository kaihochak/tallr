#!/usr/bin/env node

import pty from 'node-pty';
import { TallrClient } from './lib/http-client.js';
import { ClaudeStateTracker } from './lib/state-tracker.js';
import { getIdeCommand, promptForIdeCommand } from './lib/settings.js';
import { MAX_BUFFER_SIZE } from './lib/patterns.js';
import { execSync } from 'child_process';
import http from 'http';
import crypto from 'crypto';
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

// Generate secure token if none provided via environment
function generateSecureToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Get auth token from file or environment
function getAuthToken() {
  // Check environment variables first (highest priority)
  if (process.env.TALLR_TOKEN) {
    return process.env.TALLR_TOKEN;
  }
  
  if (process.env.SWITCHBOARD_TOKEN) {
    return process.env.SWITCHBOARD_TOKEN;
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
    // Silently fail if we can't read the token file
    if (process.env.DEBUG) {
      console.error('[Tallr] Failed to read auth token file:', error.message);
    }
  }
  
  // Fallback to the old default (this should eventually be removed)
  return 'your-secure-token-here';
}

const config = {
  token: getAuthToken(),
  gateway: process.env.TALLR_GATEWAY || 'http://127.0.0.1:4317',
  project: process.env.TL_PROJECT || 'default-project',
  repo: process.env.TL_REPO || process.cwd(),
  agent: process.env.TL_AGENT || 'cli',
  title: process.env.TL_TITLE || 'CLI Task',
  ide: process.env.TL_IDE || detectCurrentIDE()
};

const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const client = new TallrClient(config);
const stateTracker = new ClaudeStateTracker(client, taskId, config.agent, true); // Enable debug mode

function restoreTerminal() {
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

async function updateTaskAndCleanup(state, details) {
  stateTracker.stopDebugUpdates();
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

    await updateTaskAndCleanup(success ? 'DONE' : 'IDLE', details);
    restoreTerminal();
    process.exit(code);
  });

  ptyProcess.on('error', async (error) => {
    console.error(`\n[Tallr] PTY error:`, error.message);
    
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
    console.log(`\n[Tallr] Received ${signal}, cleaning up PTY...`);
    
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

    const [command, ...commandArgs] = args;

    try {
      await client.createTask(taskId);
      taskCreated = true;
    } catch (error) {
      console.error(`[Tallr] Warning: Could not create task, continuing without tracking`);
    }
    
    if (taskCreated) {
      await stateTracker.syncInitialState();
    }

    await runWithPTY(command, commandArgs);
    
  } catch (error) {
    console.error('[Tallr] Wrapper error:', error.message);
    
    if (taskCreated) {
      try {
        await client.updateTaskState(taskId, 'ERROR', `Wrapper error: ${error.message}`);
      } catch (cleanupError) {
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
