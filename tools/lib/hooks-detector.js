/**
 * Claude Code Hooks Detection
 * 
 * Utilities for detecting and working with Claude Code hooks
 */

import fs from 'fs';
import path from 'path';
import { debug } from './debug.js';

/**
 * Check if Claude Code hooks are configured for Tallr integration
 * @returns {boolean} True if hooks are configured and functional
 */
export function hasClaudeCodeHooks() {
  try {
    const claudeSettingsPath = path.join(process.cwd(), '.claude', 'settings.local.json');
    
    if (!fs.existsSync(claudeSettingsPath)) {
      debug.hooks('No .claude/settings.local.json found');
      return false;
    }
    
    const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    
    // Check if hooks section exists
    if (!settings.hooks) {
      debug.hooks('No hooks section in Claude settings');
      return false;
    }
    
    // Check for our specific hooks (including test endpoints like state-fake)
    const hasNotificationHook = settings.hooks.Notification && 
      settings.hooks.Notification.some(hook => 
        hook.hooks && hook.hooks.some(h => h.command && (
          h.command.includes('v1/tasks/state') || 
          h.command.includes('v1/tasks/state-fake')
        ))
      );
    
    const hasStopHook = settings.hooks.Stop && 
      settings.hooks.Stop.some(hook => 
        hook.hooks && hook.hooks.some(h => h.command && (
          h.command.includes('v1/tasks/state') || 
          h.command.includes('v1/tasks/state-fake')
        ))
      );
    
    const hooksConfigured = hasNotificationHook && hasStopHook;
    
    debug.hooks('Hook detection result', {
      settingsPath: claudeSettingsPath,
      hasNotificationHook,
      hasStopHook,
      hooksConfigured
    });
    
    return hooksConfigured;
    
  } catch (error) {
    debug.hooksError('Error checking for Claude Code hooks', error);
    return false;
  }
}

/**
 * Get detection method based on hooks availability
 * @returns {string} 'hooks' or 'patterns'
 */
export function getDetectionMethod() {
  return hasClaudeCodeHooks() ? 'hooks' : 'patterns';
}