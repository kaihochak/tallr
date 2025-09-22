import pty from 'node-pty';
import fs from 'fs';
import path from 'path';
import { debug } from './debug.js';
import { tryNetworkLauncher } from './network-launcher.js';
import { showPatternDetectionStatus } from './status-indicator.js';

/**
 * Set up IPC file monitoring for hook integration
 */
function setupHookIPC(stateTracker, command) {
  if (command !== 'claude') return null;

  const ipcFile = path.join(process.cwd(), '.tallr-session-ipc');

  // Create/clear IPC file
  try {
    fs.writeFileSync(ipcFile, '');
    debug.cli('Created IPC file for hook communication:', ipcFile);
  } catch (error) {
    debug.cliError('Failed to create IPC file:', error);
    return null;
  }

  // Watch for hook messages
  const watcher = fs.watchFile(ipcFile, { interval: 100 }, () => {
    try {
      const content = fs.readFileSync(ipcFile, 'utf8').trim();
      if (!content) return;

      // Process each line as a separate hook message
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          if (message.type === 'state') {
            debug.cli('Hook IPC message received:', message);
            stateTracker.changeState(message.state, message.details, 'high', 'hook');
          }
        } catch (e) {
          debug.cliError('Invalid hook IPC message:', line);
        }
      }

      // Clear file after processing
      fs.writeFileSync(ipcFile, '');
    } catch (error) {
      debug.cliError('Error reading hook IPC file:', error);
    }
  });

  return { ipcFile, watcher };
}

/**
 * Main process spawning - tries launcher first, falls back to PTY + patterns
 * Launchers are the default for all agents, with automatic fallback to pattern detection
 */
export async function runWithPTY(command, commandArgs, config, taskId, stateTracker, updateTaskAndCleanup) {
  // Set up hook IPC monitoring for Claude
  const hookIPC = setupHookIPC(stateTracker, command);

  // Try launcher first for supported agents
  const launcherSuccess = await tryNetworkLauncher(command, commandArgs, config, taskId, stateTracker);

  if (launcherSuccess) {
    // Launcher mode succeeded and handles IPC internally
    // Clean up our IPC setup since launcher handles everything
    if (hookIPC) {
      try {
        fs.unwatchFile(hookIPC.ipcFile);
        // Don't delete file here - launcher will manage it
        debug.cli('Stopped IPC monitoring - launcher mode active');
      } catch (e) {
        debug.cliError('Error stopping IPC monitoring for launcher mode:', e);
      }
    }
    return; // Success - exit early, network detection is active
  }
  
  // Fallback: PTY + pattern detection (original approach)  
  debug.cli('Using PTY + pattern detection for', command);
  
  // Show user-friendly status indicator
  showPatternDetectionStatus(command);
  
  const ptyProcess = pty.spawn(command, commandArgs, {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: { 
      ...process.env,
      TALLR_TASK_ID: taskId,
      TALLR_TOKEN: config.token
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

    // Clean up hook IPC
    if (hookIPC) {
      try {
        fs.unwatchFile(hookIPC.ipcFile);
        fs.unlinkSync(hookIPC.ipcFile);
        debug.cli('Cleaned up hook IPC file');
      } catch (e) {
        debug.cliError('Error cleaning up hook IPC:', e);
      }
    }

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

    // Clean up hook IPC
    if (hookIPC) {
      try {
        fs.unwatchFile(hookIPC.ipcFile);
        fs.unlinkSync(hookIPC.ipcFile);
        debug.cli('Cleaned up hook IPC file');
      } catch (e) {
        debug.cliError('Error cleaning up hook IPC:', e);
      }
    }

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

    // Clean up hook IPC
    if (hookIPC) {
      try {
        fs.unwatchFile(hookIPC.ipcFile);
        fs.unlinkSync(hookIPC.ipcFile);
        debug.cli('Cleaned up hook IPC file during signal cleanup');
      } catch (e) {
        debug.cliError('Error cleaning up hook IPC during signal:', e);
      }
    }

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

function restoreTerminal() {
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}