#!/usr/bin/env node

/**
 * Tally CLI Wrapper
 * 
 * Monitors CLI output for user prompts with modular architecture
 * 
 * Usage:
 *   export TALLY_TOKEN=devtoken
 *   export TL_PROJECT="my-project"
 *   export TL_REPO="/path/to/repo"
 *   export TL_AGENT="claude"
 *   export TL_TITLE="Task description"
 *   
 *   node tl-wrap.js claude --your-args-here
 */

import pty from 'node-pty';
import { TallyClient } from './lib/http-client.js';
import { ClaudeStateTracker } from './lib/state-tracker.js';

// Configuration from environment
const config = {
  token: process.env.TALLY_TOKEN || process.env.SWITCHBOARD_TOKEN || 'devtoken',
  gateway: process.env.TALLY_GATEWAY || 'http://127.0.0.1:4317',
  project: process.env.TL_PROJECT || 'default-project',
  repo: process.env.TL_REPO || process.cwd(),
  agent: process.env.TL_AGENT || 'cli',
  title: process.env.TL_TITLE || 'CLI Task',
  ide: process.env.TL_IDE || 'cursor'
};

// Generate unique task ID
const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Initialize components
const client = new TallyClient(config);
const stateTracker = new ClaudeStateTracker(client, taskId, false); // Disable debug

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

  let outputBuffer = '';

  // Simple passthrough - no processing, no interference
  ptyProcess.on('data', (data) => {
    process.stdout.write(data);
    
    // Silently collect output for state detection
    outputBuffer += data;
  });

  // Process state changes silently every 2 seconds
  setInterval(() => {
    if (outputBuffer.length > 1000) {
      // Only process recent output to avoid memory issues
      const recentOutput = outputBuffer.slice(-1000);
      
      // Simple state detection without console output
      if (recentOutput.includes('esc to interrupt') && recentOutput.includes('tokens')) {
        stateTracker.changeState('WORKING', 'Claude is processing', 'high').catch(() => {});
      } else if (recentOutput.includes('❯ 1. Yes')) {
        stateTracker.changeState('PENDING', 'Claude needs approval', 'high').catch(() => {});
      } else if (recentOutput.includes('> ') || recentOutput.includes('? for shortcuts')) {
        stateTracker.changeState('IDLE', 'Claude ready for input', 'high').catch(() => {});
      }
    }
  }, 2000);

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

    if (success) {
      await client.markTaskDone(taskId, details);
    } else {
      await client.updateTaskState(taskId, 'IDLE', details);
    }

    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(code);
  });

  // Handle PTY errors
  ptyProcess.on('error', async (error) => {
    console.error(`\n[Tally] PTY error:`, error.message);
    await client.updateTaskState(taskId, 'IDLE', `PTY error: ${error.message}`);
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(1);
  });

  // Handle signals
  const cleanup = async (signal, exitCode) => {
    console.log(`\n[Tally] Received ${signal}, cleaning up PTY...`);
    ptyProcess.kill(signal);
    await client.updateTaskState(taskId, 'IDLE', `Interactive session ${signal.toLowerCase()}`);
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(exitCode);
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

  // Process stdout
  child.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    
    stdoutBuffer += text;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    
    lines.forEach(line => stateTracker.processLine(line));
  });

  // Process stderr
  child.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    stderrBuffer += text;
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';
    
    lines.forEach(line => stateTracker.processLine(line));
  });

  // Handle process completion
  child.on('close', async (code) => {
    if (stdoutBuffer.trim()) await stateTracker.processLine(stdoutBuffer);
    if (stderrBuffer.trim()) await stateTracker.processLine(stderrBuffer);

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

    process.exit(code);
  });

  // Handle process errors
  child.on('error', async (error) => {
    console.error(`[Tally] Process error:`, error.message);
    await client.updateTaskState(taskId, 'IDLE', `Process error: ${error.message}`);
    process.exit(1);
  });

  // Handle signals
  const cleanup = async (signal, exitCode) => {
    console.log(`\n[Tally] Received ${signal}, cleaning up...`);
    child.kill(signal);
    await client.updateTaskState(taskId, 'BLOCKED', `Process ${signal.toLowerCase()}`);
    process.exit(exitCode);
  };

  process.on('SIGINT', () => cleanup('SIGINT', 130));
  process.on('SIGTERM', () => cleanup('SIGTERM', 143));
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tl-wrap.js <command> [args...]');
    process.exit(1);
  }

  const [command, ...commandArgs] = args;

  // Create initial task
  await client.createTask(taskId);
  
  // Initialize state tracking
  stateTracker.syncInitialState();

  // Choose approach based on command type
  const interactiveCLIs = ['claude', 'gemini', 'cursor-composer'];
  if (interactiveCLIs.includes(command)) {
    await runWithPTY(command, commandArgs);
  } else {
    await runWithSpawn(command, commandArgs);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[Tally] Wrapper error:', error);
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