/**
 * Claude Pattern Detection
 * 
 * Handles pattern matching for Claude CLI state detection
 */

import stripAnsi from 'strip-ansi';

export const MAX_BUFFER_SIZE = 50000;



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

export function detectClaudeState(line, recentOutput = '') {
  const cleanLine = stripAnsi(line).trim();
  if (!cleanLine) return null;
  
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