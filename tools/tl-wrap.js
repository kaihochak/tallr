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

// IDE mapping table for apps with integrated terminals
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

// Helper function to detect current IDE from environment and parent process
function detectCurrentIDE() {
  try {
    // Check environment variables that IDEs set
    if (process.env.VSCODE_INJECTION === '1' || process.env.TERM_PROGRAM === 'vscode') {
      return getIdeCommand('Visual Studio Code', 'code');
    }
    if (process.env.TERM_PROGRAM === 'cursor') {
      return getIdeCommand('Cursor', 'cursor');
    }
    
    // Check parent process (works on Unix-like systems)
    const ppid = process.ppid;
    if (ppid) {
      try {
        const parentName = execSync(`ps -p ${ppid} -o comm=`, { encoding: 'utf8' }).trim();
        
        // 1. Check user settings first
        const userCommand = getIdeCommand(parentName);
        if (userCommand) {
          return userCommand;
        }
        
        // 2. Look up in built-in mapping table
        if (IDE_MAPPINGS[parentName]) {
          return getIdeCommand(parentName, IDE_MAPPINGS[parentName]);
        }
        
        // 3. Smart fallback: try to match partial names
        for (const [appName, command] of Object.entries(IDE_MAPPINGS)) {
          if (parentName.toLowerCase().includes(appName.toLowerCase()) || 
              appName.toLowerCase().includes(parentName.toLowerCase())) {
            return getIdeCommand(parentName, command);
          }
        }
        
        // 4. Unknown IDE: prompt user and use fallback
        const fallbackCommand = promptForIdeCommand(parentName);
        return fallbackCommand;
      } catch {
        // Ignore ps command errors
      }
    }
  } catch {
    // Ignore all detection errors
  }
  
  return null; // Let server decide or use default
}

// Configuration from environment
const config = {
  token: process.env.TALLOR_TOKEN || process.env.SWITCHBOARD_TOKEN || 'devtoken',
  gateway: process.env.TALLOR_GATEWAY || 'http://127.0.0.1:4317',
  project: process.env.TL_PROJECT || 'default-project',
  repo: process.env.TL_REPO || process.cwd(),
  agent: process.env.TL_AGENT || 'cli',
  title: process.env.TL_TITLE || 'CLI Task',
  ide: process.env.TL_IDE || detectCurrentIDE()
};

// Generate unique task ID
const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Check if debug mode is enabled
const debugEnabled = process.env.TALLOR_DEBUG === 'true' || 
                    process.env.DEBUG?.includes('tallor') || 
                    process.env.NODE_ENV === 'development';

// Initialize components
const client = new TallorClient(config);
const stateTracker = new ClaudeStateTracker(client, taskId, debugEnabled);

// Register state tracker for debug access
debugRegistry.register(taskId, stateTracker);

debug.cli('CLI wrapper initialized', {
  taskId,
  agent: config.agent,
  project: config.project,
  debugEnabled
});

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

  let recentOutput = ''; // Rolling buffer for recent output to send to Tally
  const MAX_OUTPUT_SIZE = 3000; // Keep last 3000 chars for UI display

  // Real-time character processing - preserve terminal control flow
  ptyProcess.on('data', (data) => {
    // Immediate passthrough for display - preserves all terminal control sequences
    process.stdout.write(data);

    // Maintain rolling buffer of recent output for context
    recentOutput += data;
    if (recentOutput.length > MAX_OUTPUT_SIZE * 2) {
      recentOutput = recentOutput.slice(-MAX_OUTPUT_SIZE);
    }
    
    // Update debug buffer immediately on every data chunk
    stateTracker.updateDebugBuffer(recentOutput);
    
    // Simplified processing - keep more of the original data
    const lines = data.toString().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim()) {
        // Process each line for state detection
        stateTracker.processLine(line, recentOutput).catch(() => {});
      }
    }
  });

  // Forward user input to PTY
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      ptyProcess.write(data);
    });
  }

  // Handle PTY exit
  ptyProcess.on('exit', async (code, signal) => {
    const success = code === 0;
    const details = success 
      ? `Claude session completed successfully` 
      : `Claude session ended with code ${code}`;

    // Stop state tracker first to prevent race conditions
    stateTracker.stopDebugUpdates();
    debugRegistry.unregister(taskId);

    if (success) {
      await client.updateTaskState(taskId, 'DONE', details);
    } else {
      await client.updateTaskState(taskId, 'IDLE', details);
    }

    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(code);
  });

  // Handle PTY errors with better recovery
  ptyProcess.on('error', async (error) => {
    console.error(`\n[Tallor] PTY error:`, error.message);
    
    // Attempt graceful cleanup
    try {
      // Restore terminal mode first
      if (process.stdin.setRawMode && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      
      // Update task state with error details
      await client.updateTaskState(taskId, 'ERROR', `PTY error: ${error.message}`);
      
      // Cleanup debug updates
      debugRegistry.unregister(taskId);
      stateTracker.stopDebugUpdates();
    } catch (cleanupError) {
      console.error(`[Tallor] Cleanup error:`, cleanupError.message);
    }
    
    // Exit with appropriate code based on error type
    const exitCode = error.code === 'ENOENT' ? 127 : 1;
    process.exit(exitCode);
  });

  // Handle signals with robust cleanup
  const cleanup = async (signal, exitCode) => {
    console.log(`\n[Tallor] Received ${signal}, cleaning up PTY...`);
    
    try {
      // Kill PTY process if still running
      if (ptyProcess && !ptyProcess.killed) {
        ptyProcess.kill(signal);
      }
      
      // Restore terminal mode
      if (process.stdin.setRawMode && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      
      // Update task state
      await client.updateTaskState(taskId, 'CANCELLED', `Interactive session ${signal.toLowerCase()}`);
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
 * Traditional spawn approach for non-interactive commands
 */
async function runWithSpawn(command, commandArgs) {
  const { spawn } = await import('child_process');
  
  const child = spawn(command, commandArgs, {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let recentOutput = ''; // Rolling buffer for recent output
  const MAX_OUTPUT_SIZE = 3000;

  // Process stdout
  child.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    
    // Maintain rolling buffer
    recentOutput += text;
    if (recentOutput.length > MAX_OUTPUT_SIZE * 2) {
      recentOutput = recentOutput.slice(-MAX_OUTPUT_SIZE);
    }
    
    stdoutBuffer += text;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    
    lines.forEach(line => stateTracker.processLine(line, recentOutput));
  });

  // Process stderr
  child.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    // Include stderr in rolling buffer too
    recentOutput += text;
    if (recentOutput.length > MAX_OUTPUT_SIZE * 2) {
      recentOutput = recentOutput.slice(-MAX_OUTPUT_SIZE);
    }
    
    stderrBuffer += text;
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';
    
    lines.forEach(line => stateTracker.processLine(line, recentOutput));
  });

  // Handle process completion
  child.on('close', async (code) => {
    if (stdoutBuffer.trim()) await stateTracker.processLine(stdoutBuffer, recentOutput);
    if (stderrBuffer.trim()) await stateTracker.processLine(stderrBuffer, recentOutput);

    const summary = stateTracker.getStateSummary();
    const success = code === 0;
    const details = success 
      ? `Command completed successfully` 
      : `Command failed with exit code ${code}`;


    if (success) {
      await client.markTaskDone(taskId, details);
    } else {
      await client.updateTaskState(taskId, 'IDLE', details);
    }

    // Cleanup debug registry and stop debug updates
    debugRegistry.unregister(taskId);
    stateTracker.stopDebugUpdates();

    process.exit(code);
  });

  // Handle process errors with better diagnostics
  child.on('error', async (error) => {
    console.error(`[Tallor] Process error:`, error.message);
    
    try {
      // Provide better error context
      let errorDetails = `Process error: ${error.message}`;
      if (error.code === 'ENOENT') {
        errorDetails = `Command not found: ${command}. Check if '${command}' is installed and in PATH.`;
      } else if (error.code === 'EACCES') {
        errorDetails = `Permission denied: ${command}. Check file permissions.`;
      }
      
      await client.updateTaskState(taskId, 'ERROR', errorDetails);
    } catch (updateError) {
      console.error(`[Tallor] Failed to update error state:`, updateError.message);
    }
    
    const exitCode = error.code === 'ENOENT' ? 127 : 1;
    process.exit(exitCode);
  });

  // Handle signals with robust cleanup
  const cleanup = async (signal, exitCode) => {
    console.log(`\n[Tallor] Received ${signal}, cleaning up...`);
    
    try {
      // Kill child process if still running
      if (child && !child.killed) {
        child.kill(signal);
      }
      
      // Update task state
      await client.updateTaskState(taskId, 'CANCELLED', `Process ${signal.toLowerCase()}`);
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

    // Create initial task
    try {
      await client.createTask(taskId);
      taskCreated = true;
    } catch (error) {
      // Continue even if task creation fails
      console.error(`[Tallor] Warning: Could not create task, continuing without tracking`);
    }
    
    // Initialize state tracking
    if (taskCreated) {
      await stateTracker.syncInitialState();
    }

    // Choose approach based on command type
    const interactiveCLIs = ['claude', 'gemini', 'cursor-composer'];
    if (interactiveCLIs.includes(command)) {
      await runWithPTY(command, commandArgs);
    } else {
      await runWithSpawn(command, commandArgs);
    }
    
  } catch (error) {
    console.error('[Tallor] Wrapper error:', error.message);
    
    // Try to clean up task state if it was created
    if (taskCreated) {
      try {
        await client.updateTaskState(taskId, 'ERROR', `Wrapper error: ${error.message}`);
      } catch (cleanupError) {
        // Ignore cleanup errors
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
    // Ignore cleanup errors
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Tallor] Unhandled promise rejection:', reason);
  try {
    await client.updateTaskState(taskId, 'ERROR', `Unhandled rejection: ${reason}`);
  } catch {
    // Ignore cleanup errors
  }
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[Tallor] Fatal wrapper error:', error.message);
    process.exit(1);
  });
}

// Export for testing
export { 
  config,
  client,
  stateTracker,
  runWithPTY,
  runWithSpawn
};