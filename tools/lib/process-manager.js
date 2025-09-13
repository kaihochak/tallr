import pty from 'node-pty';
import { debug } from './debug.js';
import { tryNetworkLauncher } from './network-launcher.js';
import { showPatternDetectionStatus } from './status-indicator.js';

/**
 * Main process spawning - tries launcher first, falls back to PTY + patterns
 * Launchers are the default for all agents, with automatic fallback to pattern detection
 */
export async function runWithPTY(command, commandArgs, config, taskId, stateTracker, updateTaskAndCleanup) {
  // Try launcher first for supported agents
  const launcherSuccess = await tryNetworkLauncher(command, commandArgs, config, taskId, stateTracker);
  
  if (launcherSuccess) {
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

function restoreTerminal() {
  if (process.stdin.setRawMode && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}