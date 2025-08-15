#!/usr/bin/env node

/**
 * Tally CLI Wrapper - Monitors CLI output for user prompts
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
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Patterns that indicate the CLI is waiting for user input
const WAITING_PATTERNS = [
  /Approve\?\s*\[y\/N\]/i,
  /requires approval/i,
  /awaiting confirmation/i,
  /\[y\/N\]/i,
  /Press Enter to continue/i,
  /Continue\?\s*\[y\/n\]/i,
  /waiting for user/i,
  /user input required/i,
  /proceed\?\s*\[y\/n\]/i
];

const ERROR_PATTERNS = [
  /error:/i,
  /failed:/i,
  /exception/i,
  /traceback/i,
  /\berror\b/i
];

// Generate unique task ID
const taskId = `${config.agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

let isWaitingForUser = false;
let hasError = false;

// HTTP request helper
function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.gateway);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Create initial task
async function createTask() {
  try {
    await makeRequest('POST', '/v1/tasks/upsert', {
      project: {
        name: config.project,
        repoPath: config.repo,
        preferredIDE: config.ide
      },
      task: {
        id: taskId,
        agent: config.agent,
        title: config.title,
        state: 'RUNNING'
      }
    });
    console.log(`[Tally] Created task ${taskId} for ${config.project}`);
  } catch (error) {
    console.error(`[Tally] Failed to create task:`, error.message);
  }
}

// Update task state
async function updateTaskState(state, details) {
  try {
    await makeRequest('POST', '/v1/tasks/state', {
      taskId: taskId,
      state: state,
      details: details
    });
    console.log(`[Tally] Task ${taskId} → ${state}`);
  } catch (error) {
    console.error(`[Tally] Failed to update task:`, error.message);
  }
}

// Mark task as done
async function markTaskDone(details) {
  try {
    await makeRequest('POST', '/v1/tasks/done', {
      taskId: taskId,
      details: details
    });
    console.log(`[Tally] Task ${taskId} completed`);
  } catch (error) {
    console.error(`[Tally] Failed to mark task done:`, error.message);
  }
}

// Process output line
function processLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Check for waiting patterns
  const isWaiting = WAITING_PATTERNS.some(pattern => pattern.test(trimmed));
  if (isWaiting && !isWaitingForUser) {
    isWaitingForUser = true;
    updateTaskState('WAITING_USER', trimmed);
  }

  // Check for error patterns
  const isError = ERROR_PATTERNS.some(pattern => pattern.test(trimmed));
  if (isError && !hasError) {
    hasError = true;
    updateTaskState('ERROR', trimmed);
  }
}

// Detect if command should use interactive mode
function needsInteractiveMode(command, args) {
  // Interactive AI CLIs that need PTY
  const interactiveCLIs = ['claude', 'gemini', 'cursor-composer'];
  return interactiveCLIs.includes(command);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tl-wrap.js <command> [args...]');
    process.exit(1);
  }

  const [command, ...commandArgs] = args;

  // Create initial task
  await createTask();

  // Choose approach based on command type
  if (needsInteractiveMode(command, commandArgs)) {
    await runWithPTY(command, commandArgs);
  } else {
    await runWithSpawn(command, commandArgs);
  }
}

// PTY approach for interactive CLIs
async function runWithPTY(command, commandArgs) {
  // Create PTY process
  const ptyProcess = pty.spawn(command, commandArgs, {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: process.env
  });

  let outputBuffer = '';

  // Monitor PTY output
  ptyProcess.on('data', (data) => {
    // Display output to user (preserve interactive experience)
    process.stdout.write(data);
    
    // Monitor for notification patterns
    outputBuffer += data;
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop() || ''; // Keep incomplete line
    
    lines.forEach(processLine);
  });

  // Forward user input to PTY (if stdin supports raw mode)
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      ptyProcess.write(data);
    });
  }

  // Handle PTY exit
  ptyProcess.on('exit', async (code, signal) => {
    // Process any remaining buffered output
    if (outputBuffer.trim()) processLine(outputBuffer);

    const success = code === 0;
    const details = success 
      ? `Interactive session completed successfully` 
      : `Interactive session ended with code ${code}`;

    if (success && !hasError) {
      await markTaskDone(details);
    } else {
      await updateTaskState('ERROR', details);
    }

    // Restore terminal
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(code);
  });

  // Handle PTY errors
  ptyProcess.on('error', async (error) => {
    console.error(`\n[Tally] PTY error:`, error.message);
    await updateTaskState('ERROR', `PTY error: ${error.message}`);
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(1);
  });

  // Handle signals for PTY
  process.on('SIGINT', async () => {
    console.log('\n[Tally] Received SIGINT, cleaning up PTY...');
    ptyProcess.kill('SIGINT');
    await updateTaskState('BLOCKED', 'Interactive session interrupted by user');
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(130);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Tally] Received SIGTERM, cleaning up PTY...');
    ptyProcess.kill('SIGTERM');
    await updateTaskState('BLOCKED', 'Interactive session terminated');
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(143);
  });
}

// Traditional spawn approach for non-interactive commands
async function runWithSpawn(command, commandArgs) {
  const { spawn } = await import('child_process');
  
  // Spawn the process
  const child = spawn(command, commandArgs, {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  // Buffer for incomplete lines
  let stdoutBuffer = '';
  let stderrBuffer = '';

  // Process stdout
  child.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    
    stdoutBuffer += text;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || ''; // Keep incomplete line
    
    lines.forEach(processLine);
  });

  // Process stderr
  child.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    stderrBuffer += text;
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || ''; // Keep incomplete line
    
    lines.forEach(processLine);
  });

  // Handle process completion
  child.on('close', async (code) => {
    // Process any remaining buffered output
    if (stdoutBuffer.trim()) processLine(stdoutBuffer);
    if (stderrBuffer.trim()) processLine(stderrBuffer);

    const success = code === 0;
    const details = success 
      ? `Command completed successfully` 
      : `Command failed with exit code ${code}`;

    if (success && !hasError) {
      await markTaskDone(details);
    } else {
      await updateTaskState('ERROR', details);
    }

    process.exit(code);
  });

  // Handle process errors
  child.on('error', async (error) => {
    console.error(`[Tally] Process error:`, error.message);
    await updateTaskState('ERROR', `Process error: ${error.message}`);
    process.exit(1);
  });

  // Handle signals
  process.on('SIGINT', async () => {
    console.log('\n[Tally] Received SIGINT, cleaning up...');
    child.kill('SIGINT');
    await updateTaskState('BLOCKED', 'Process interrupted by user');
    process.exit(130);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Tally] Received SIGTERM, cleaning up...');
    child.kill('SIGTERM');
    await updateTaskState('BLOCKED', 'Process terminated');
    process.exit(143);
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[Tally] Wrapper error:', error);
    process.exit(1);
  });
}

export { makeRequest, processLine, WAITING_PATTERNS, ERROR_PATTERNS };