/**
 * Claude Pattern Detection
 * 
 * Handles pattern matching for Claude CLI state detection
 */

import stripAnsi from 'strip-ansi';

export const MAX_BUFFER_SIZE = 50000;

/**
 * Clean ANSI codes from terminal output for STATE DETECTION
 * Aggressive cleaning to ensure reliable pattern matching
 */
export function cleanANSIForDetection(text) {
  return text
    // Remove all ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Most ANSI sequences
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, '') // OSC sequences
    .replace(/\x1b[=>]/g, '') // Application keypad
    .replace(/\x1b[()][AB012]/g, '') // Character set sequences
    // Remove control characters but keep printable Unicode
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove box-drawing characters
    .replace(/[│─┌┐└┘├┤┬┴┼╭╮╰╯]/g, '')
    // Clean up whitespace - preserve carriage return semantics
    .replace(/\r\n/g, '\n')
    // NOTE: Do NOT convert \r to \n - carriage returns are already handled in real-time parsing
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')  // Collapse whitespace for reliable pattern matching
    .trim();
}


/**
 * Pattern definitions for Claude state detection
 */
const CLAUDE_PATTERNS = [
  {
    pattern: '❯\\s*\\d+\\.\\s+',
    regex: /❯\s*\d+\.\s+/,
    description: 'Claude numbered prompt detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'esc to interrupt',
    regex: /esc to interrupt/i,
    description: 'Working state detection',
    expectedState: 'WORKING'
  },
];

/**
 * Detect Claude state from cleaned line and context
 */
export function detectClaudeState(line, contextBuffer, recentOutput = '', contextLines = []) {
  const cleanLine = cleanANSIForDetection(line);
  if (!cleanLine || cleanLine.length < 3) return null;
  
  // Test all patterns and collect debug data
  const patternTests = CLAUDE_PATTERNS.map(p => ({
    pattern: p.pattern,
    description: p.description,
    matches: p.regex.test(cleanLine),
    expectedState: p.expectedState
  }));
  
  // Check for WORKING patterns in recent context
  const workingPatterns = CLAUDE_PATTERNS.filter(p => p.expectedState === 'WORKING');
  const hasWorkingPattern = workingPatterns.some(p => p.regex.test(recentOutput));
  
  if (hasWorkingPattern) {
    return {
      state: 'WORKING',
      details: cleanLine,
      confidence: 'high',
      patternTests
    };
  }
  
  // Check for PENDING patterns in recent context
  const pendingPatterns = CLAUDE_PATTERNS.filter(p => p.expectedState === 'PENDING');
  const hasPendingPattern = pendingPatterns.some(p => p.regex.test(recentOutput));
  
  if (hasPendingPattern) {
    return {
      state: 'PENDING',
      details: cleanLine,
      confidence: 'high',
      patternTests
    };
  }
  
  // Default to IDLE when no special patterns found
  return {
    state: 'IDLE',
    details: cleanLine,
    confidence: 'medium',
    patternTests
  };
}