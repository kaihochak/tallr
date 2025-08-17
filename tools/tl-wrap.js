#!/usr/bin/env node

/**
 * Tallor CLI Wrapper
 * 
 * Monitors CLI output for user prompts with modular architecture
 * 
 * Usage:
 *   export TALLOR_TOKEN=devtoken
 *   export TL_PROJECT="my-project"
 *   export TL_REPO="/path/to/repo"
 *   export TL_AGENT="claude"
 *   export TL_TITLE="Task description"
 *   
 *   node tl-wrap.js claude --your-args-here
 */

import pty from 'node-pty';
import { TallorClient } from './lib/http-client.js';
import { ClaudeStateTracker } from './lib/state-tracker.js';
import { getIdeCommand, promptForIdeCommand } from './lib/settings.js';
import { debugRegistry } from './lib/debug-registry.js';
import { debug } from './lib/debug.js';
import { execSync } from 'child_process';
import http from 'http';

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
    if (process.env.TERM_PROGRAM === 'cursor') {
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

const config = {
  token: process.env.TALLOR_TOKEN || process.env.SWITCHBOARD_TOKEN || 'devtoken',
  gateway: process.env.TALLOR_GATEWAY || 'http://127.0.0.1:4317',
  project: process.env.TL_PROJECT || 'default-project',
  repo: process.env.TL_REPO || process.cwd(),
  agent: process.env.TL_AGENT || 'cli',
  title: process.env.TL_TITLE || 'CLI Task',
  ide: process.env.TL_IDE || detectCurrentIDE()
};

const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const debugEnabled = process.env.TALLOR_DEBUG === 'true' || 
                    process.env.DEBUG?.includes('tallor') || 
                    process.env.NODE_ENV === 'development';

const client = new TallorClient(config);
const stateTracker = new ClaudeStateTracker(client, taskId, debugEnabled);

debugRegistry.register(taskId, stateTracker);

debug.cli('CLI wrapper initialized', {
  taskId,
  agent: config.agent,
  project: config.project,
  debugEnabled
});

function restoreTerminal() {
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

async function updateTaskAndCleanup(state, details) {
  stateTracker.stopDebugUpdates();
  debugRegistry.unregister(taskId);
  await client.updateTaskState(taskId, state, details);
}

class LineBuffer {
  constructor() {
    this.buffer = '';
  }
  
  processChunk(data, lineCallback) {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    
    this.buffer = lines.pop() || '';
    
    lines.forEach(line => {
      if (line.trim()) {
        lineCallback(line);
      }
    });
  }
  
  flush(lineCallback) {
    if (this.buffer.trim()) {
      lineCallback(this.buffer);
      this.buffer = '';
    }
  }
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

  let recentOutput = '';
  const MAX_OUTPUT_SIZE = 3000;
  const lineBuffer = new LineBuffer();

  // Process output
  ptyProcess.on('data', (data) => {
    process.stdout.write(data);

    recentOutput += data;
    if (recentOutput.length > MAX_OUTPUT_SIZE) {
      recentOutput = recentOutput.slice(-MAX_OUTPUT_SIZE);
    }
    
    stateTracker.updateDebugBuffer(recentOutput);
    
    lineBuffer.processChunk(data, (line) => {
      stateTracker.processLine(line, recentOutput).catch(() => {});
    });
  });

  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      ptyProcess.write(data);
    });
  }

  ptyProcess.on('exit', async (code, signal) => {
    lineBuffer.flush((line) => {
      stateTracker.processLine(line, recentOutput).catch(() => {});
    });

    const success = code === 0;
    const details = success 
      ? `Claude session completed successfully` 
      : `Claude session ended with code ${code}`;

    await updateTaskAndCleanup(success ? 'DONE' : 'IDLE', details);
    restoreTerminal();
    process.exit(code);
  });

  ptyProcess.on('error', async (error) => {
    console.error(`\n[Tallor] PTY error:`, error.message);
    
    try {
      restoreTerminal();
      await updateTaskAndCleanup('ERROR', `PTY error: ${error.message}`);
    } catch (cleanupError) {
      console.error(`[Tallor] Cleanup error:`, cleanupError.message);
    }
    
    const exitCode = error.code === 'ENOENT' ? 127 : 1;
    process.exit(exitCode);
  });

  const cleanup = async (signal, exitCode) => {
    console.log(`\n[Tallor] Received ${signal}, cleaning up PTY...`);
    
    try {
      if (ptyProcess && !ptyProcess.killed) {
        ptyProcess.kill(signal);
      }
      restoreTerminal();
      await updateTaskAndCleanup('CANCELLED', `Interactive session ${signal.toLowerCase()}`);
    } catch (cleanupError) {
      console.error(`[Tallor] Cleanup error:`, cleanupError.message);
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
      console.error(`[Tallor] Warning: Could not create task, continuing without tracking`);
    }
    
    if (taskCreated) {
      await stateTracker.syncInitialState();
    }

    await runWithPTY(command, commandArgs);
    
  } catch (error) {
    console.error('[Tallor] Wrapper error:', error.message);
    
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
  console.error('[Tallor] Uncaught exception:', error.message);
  try {
    await client.updateTaskState(taskId, 'ERROR', `Uncaught exception: ${error.message}`);
  } catch {
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Tallor] Unhandled promise rejection:', reason);
  try {
    await client.updateTaskState(taskId, 'ERROR', `Unhandled rejection: ${reason}`);
  } catch {
  }
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[Tallor] Fatal wrapper error:', error.message);
    process.exit(1);
  });
}

export { 
  config,
  client,
  stateTracker,
  runWithPTY
};