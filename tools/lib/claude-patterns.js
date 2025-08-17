/**
 * Claude Pattern Detection
 * 
 * Handles pattern matching for Claude CLI state detection
 */

import stripAnsi from 'strip-ansi';

export const MAX_BUFFER_SIZE = 5000;



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
  
  // Use recent output for both pattern tests AND detection for consistency
  const recentLines = recentOutput.split('\n').slice(-15).join('\n'); // Last 15 lines
  const recentFewLines = recentOutput.split('\n').slice(-5).join('\n'); // Last 5 lines for PENDING
  
  // Test all patterns against recent buffer (consistent with detection logic)
  const patternTests = CLAUDE_PATTERNS.map(p => ({
    pattern: p.pattern,
    description: p.description,
    matches: p.regex.test(recentLines), // Use same data source as detection
    expectedState: p.expectedState
  }));
  
  // PRIORITY 1: Check for PENDING patterns in recent lines (immediate response needed)
  const pendingPatterns = CLAUDE_PATTERNS.filter(p => p.expectedState === 'PENDING');
  const hasPendingInRecent = pendingPatterns.some(p => p.regex.test(recentFewLines));
  const hasPendingInCurrent = pendingPatterns.some(p => p.regex.test(cleanLine));
  
  if (hasPendingInRecent || hasPendingInCurrent) {
    return {
      state: 'PENDING',
      details: cleanLine,
      confidence: 'high',
      patternTests
    };
  }
  
  // PRIORITY 2: Check for WORKING patterns in recent output (only if no PENDING found)
  const workingPatterns = CLAUDE_PATTERNS.filter(p => p.expectedState === 'WORKING');
  const hasWorkingPattern = workingPatterns.some(p => p.regex.test(recentLines));
  
  if (hasWorkingPattern) {
    return {
      state: 'WORKING',
      details: cleanLine,
      confidence: 'high',
      patternTests
    };
  }
  
  // PRIORITY 3: Default to IDLE if no active patterns found
  return {
    state: 'IDLE',
    details: cleanLine,
    confidence: 'low', // Low confidence for IDLE detection
    patternTests
  };
}