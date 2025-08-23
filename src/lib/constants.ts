import { TaskState } from '@/types';

/**
 * UI and interaction constants
 */
export const COPY_TIMEOUT = 2000;

export const NO_DRAG_STYLE = { 
  WebkitAppRegion: 'no-drag' 
} as React.CSSProperties;

/**
 * Window size configurations for different view modes
 */
export const WINDOW_SIZES = {
  full: { width: 360, height: 600 },
  simple: { width: 360, height: 450 },
  tally: { width: 360, height: 80 }
} as const;

/**
 * Task state priority for sorting and filtering
 * Lower numbers = higher priority
 */
export const TASK_STATE_PRIORITY: Record<TaskState, number> = {
  PENDING: 0,
  WORKING: 1,
  IDLE: 2,
  DONE: 3,
  ERROR: 4
} as const;

/**
 * Time constants
 */
export const ONE_HOUR = 60 * 60 * 1000;

/**
 * CLI agent options for setup wizard
 */
export const AGENT_OPTIONS = [
  { value: 'claude', label: 'Claude Code CLI' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'gemini', label: 'Gemini CLI' }
] as const;

/**
 * Manual installation command for setup wizard
 */
export const SYMLINK_COMMAND = 'sudo ln -s /Applications/Tallr.app/Contents/MacOS/tallr /usr/local/bin/tallr';