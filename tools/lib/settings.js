#!/usr/bin/env node

/**
 * Settings Manager for Tallr CLI
 * Handles user-specific IDE mappings and preferences
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Settings file location
const SETTINGS_DIR = path.join(os.homedir(), '.tallr');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Default settings structure
const DEFAULT_SETTINGS = {
  ideMapping: {},
  version: '0.1.1'
};

/**
 * Ensure settings directory exists
 */
function ensureSettingsDir() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Load settings from file, creating defaults if needed
 */
function loadSettings() {
  try {
    ensureSettingsDir();
    
    if (!fs.existsSync(SETTINGS_FILE)) {
      // Create default settings file
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return DEFAULT_SETTINGS;
    }
    
    const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(content);
    
    // Merge with defaults to ensure all required fields exist
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('[Tallr] Error loading settings:', error.message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to file
 */
function saveSettings(settings) {
  try {
    ensureSettingsDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('[Tallr] Error saving settings:', error.message);
    return false;
  }
}

/**
 * Get IDE command for a given application name
 * Checks user settings first, then falls back to detection
 */
function getIdeCommand(appName, detectedCommand = null) {
  const settings = loadSettings();
  
  // Check user-defined mappings first
  if (settings.ideMapping[appName]) {
    return settings.ideMapping[appName];
  }
  
  // Fall back to detected command
  return detectedCommand;
}

/**
 * Save a new IDE mapping to user settings
 */
function saveIdeMapping(appName, command) {
  const settings = loadSettings();
  settings.ideMapping[appName] = command;
  return saveSettings(settings);
}

/**
 * Prompt user for IDE command when unknown IDE is detected
 */
function promptForIdeCommand(appName) {
  console.log(`\n[Tallr] Unknown IDE '${appName}' detected.`);
  console.log('To enable jump-to-context, please tell us the command to open this IDE:');
  console.log(`Example: if you open projects with '${appName.toLowerCase()}', enter: ${appName.toLowerCase()}`);
  console.log('');
  console.log('You can also:');
  console.log('1. Set TL_IDE environment variable: export TL_IDE=your-command');
  console.log('2. Edit ~/.tallr/settings.json manually');
  console.log('3. Report this IDE at: https://github.com/kaihochak/tallr/issues');
  console.log('');
  
  // For now, we'll just return a guessed command
  // In a future version, we could add interactive prompting
  const guessed = appName.toLowerCase().replace(/\s+/g, '');
  console.log(`[Tallr] Using guessed command: ${guessed}`);
  console.log(`[Tallr] To customize, run: echo '{"ideMapping":{"${appName}":"your-command"}}' > ~/.tallr/settings.json`);
  
  return guessed;
}

/**
 * List all IDE mappings
 */
function listIdeMappings() {
  const settings = loadSettings();
  return settings.ideMapping;
}

export {
  loadSettings,
  saveSettings,
  getIdeCommand,
  saveIdeMapping,
  promptForIdeCommand,
  listIdeMappings,
  SETTINGS_FILE
};