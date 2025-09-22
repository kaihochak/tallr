#!/usr/bin/env node

import { TallrClient } from './lib/http-client.js';
import { StateTracker } from './lib/state-tracker.js';
import { debug } from './lib/debug.js';
import { showLogo } from './logo.js';
import { detectCurrentIDE } from './lib/ide-detector.js';
import { getAuthToken, detectTallrGateway } from './lib/auth-manager.js';
import { runWithPTY } from './lib/process-manager.js';
import { setupClaudeHooks } from './lib/claude-hooks.js';

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

async function updateTaskAndCleanup(state, details) {
  stateTracker.stopDebugUpdates();
  client.stopHealthPings();
  await client.updateTaskState(taskId, state, details);
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

    // Set up automatic Claude hooks for PENDING detection
    if (command === 'claude') {
      const hookSetupSuccess = setupClaudeHooks(process.cwd(), taskId, config.token, config.gateway);
      if (hookSetupSuccess) {
        debug.cli('Claude hooks configured automatically');
      }
    }

    await runWithPTY(command, commandArgs, config, taskId, stateTracker, updateTaskAndCleanup);
    
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
  stateTracker
};
