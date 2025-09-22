import fs from 'fs';
import path from 'path';
import { debug } from './debug.js';

let settingsFilePath = null;

/**
 * Automatically set up Claude hooks for PENDING state detection
 * Creates or updates .claude/settings.local.json with Tallr hooks
 * Non-destructive: preserves all existing user hooks
 */
export function setupClaudeHooks(projectRoot, taskId, token, gatewayUrl = 'http://127.0.0.1:4317') {
  try {
    const claudeDir = path.join(projectRoot, '.claude');
    settingsFilePath = path.join(claudeDir, 'settings.local.json');

    // Check if our hooks are already set up
    if (areHooksActive(projectRoot)) {
      debug.cli('Tallr hooks already configured, skipping setup');
      return true;
    }

    // Ensure .claude directory exists
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
      debug.cli('Created .claude directory for hooks');
    }

    // Read existing settings if present
    let existingSettings = {};
    if (fs.existsSync(settingsFilePath)) {
      try {
        const content = fs.readFileSync(settingsFilePath, 'utf8');
        existingSettings = JSON.parse(content);
        debug.cli('Found existing Claude settings, will preserve all user configuration');
      } catch (e) {
        debug.cliError('Invalid JSON in settings.local.json, starting fresh:', e);
      }
    }

    // Generate Tallr-specific hooks
    const tallrHooks = generateTallrHooks(taskId, token, gatewayUrl);

    // Merge hooks without overwriting user's existing hooks
    const updatedSettings = mergeHooks(existingSettings, tallrHooks);

    // Write updated settings
    fs.writeFileSync(settingsFilePath, JSON.stringify(updatedSettings, null, 2));
    debug.cli('Claude hooks added automatically for PENDING detection (preserving existing hooks)');

    return true;
  } catch (error) {
    debug.cliError('Failed to set up Claude hooks:', error);
    return false;
  }
}

/**
 * Generate Tallr-specific hook configuration using local IPC
 */
function generateTallrHooks(taskId, token, gatewayUrl) {
  // Use a local file-based IPC mechanism instead of HTTP calls
  const ipcFile = path.join(process.cwd(), '.tallr-session-ipc');

  return {
    hooks: {
      // Notification hook - fires when Claude shows notifications (including tool requests)
      "Notification": [{
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": `echo '{"type":"state","state":"PENDING","details":"Tool permission requested","source":"hook","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}' >> "${ipcFile}" 2>/dev/null || true`
        }]
      }],

      // PreToolUse hook - fires right before tool execution
      "PreToolUse": [{
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": `echo '{"type":"state","state":"PENDING","details":"Tool: {{tool_name}}","source":"hook","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}' >> "${ipcFile}" 2>/dev/null || true`
        }]
      }],

      // Stop hook - fires when Claude stops processing
      "Stop": [{
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": `echo '{"type":"state","state":"IDLE","details":"Processing complete","source":"hook","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}' >> "${ipcFile}" 2>/dev/null || true`
        }]
      }]
    }
  };
}

/**
 * Merge Tallr hooks with existing user hooks
 */
function mergeHooks(existingSettings, tallrHooks) {
  const merged = { ...existingSettings };

  if (!merged.hooks) {
    merged.hooks = {};
  }

  // For each Tallr hook type
  for (const [hookType, hookConfigs] of Object.entries(tallrHooks.hooks)) {
    if (!merged.hooks[hookType]) {
      // No existing hook of this type, just add ours
      merged.hooks[hookType] = hookConfigs;
    } else {
      // Existing hooks present, need to merge carefully
      // Check if our hook already exists (avoid duplicates)
      const tallrHookCommand = hookConfigs[0].hooks[0].command;
      const existingHooks = merged.hooks[hookType];

      const hasTallrHook = existingHooks.some(config =>
        config.hooks?.some(hook =>
          hook.command?.includes('/v1/tasks/state') &&
          hook.command?.includes('source":"hook"')
        )
      );

      if (!hasTallrHook) {
        // Add our hook to existing ones
        merged.hooks[hookType] = [...existingHooks, ...hookConfigs];
      }
    }
  }

  return merged;
}

/**
 * No cleanup needed - we preserve all user settings permanently
 * Our hooks are added non-destructively and remain until user manually removes them
 */

/**
 * Check if hooks are currently active
 */
export function areHooksActive(projectRoot) {
  try {
    const settingsFile = path.join(projectRoot, '.claude', 'settings.local.json');
    if (!fs.existsSync(settingsFile)) {
      return false;
    }

    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

    // Check if our hooks are present
    return settings.hooks?.Notification?.some(config =>
      config.hooks?.some(hook =>
        hook.command?.includes('/v1/tasks/state') &&
        hook.command?.includes('source":"hook"')
      )
    );
  } catch (e) {
    return false;
  }
}