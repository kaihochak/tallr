/**
 * Pattern Detection
 *
 * Handles pattern matching for different AI CLIs (Claude, Codex, Gemini)
 */

import stripAnsi from 'strip-ansi';

export const MAX_BUFFER_SIZE = 5000;

/**
 * Pattern definitions
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
    description: 'Claude working state detection',
    expectedState: 'WORKING'
  },
];

// Minimal Codex patterns – starting set
const CODEX_PATTERNS = [
  {
    pattern: '▌',
    regex: /▌/,
    description: 'Codex prompt indicator detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'esc to interrupt',
    regex: /esc to interrupt/i,
    description: 'Codex working state detection',
    expectedState: 'WORKING'
  }
];

// Gemini patterns (split for clarity)
const GEMINI_PATTERNS = [
  {
    pattern: '● \\d+\\. Yes',
    regex: /● \d+\. Yes/,
    description: 'Gemini numbered prompt detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'esc to cancel',
    regex: /esc to cancel/i,
    description: 'Gemini working state detection',
    expectedState: 'WORKING'
  }
];

const DEFAULT_AGENT = 'claude';

function getPatternsForAgent(agent = DEFAULT_AGENT) {
  const a = (agent || DEFAULT_AGENT).toLowerCase();
  if (a.includes('codex')) return CODEX_PATTERNS;
  if (a.includes('gemini')) return GEMINI_PATTERNS;
  return CLAUDE_PATTERNS; // default
}

export function detectState(agent, line, recentOutput = '') {
  const patterns = getPatternsForAgent(agent);
  const cleanLine = stripAnsi(line).trim();
  if (!cleanLine) return null;
  
  // Use recent output for both pattern tests AND detection for consistency
  const recentLines = recentOutput.split('\n').slice(-15).join('\n'); // Last 15 lines
  const recentFewLines = recentOutput.split('\n').slice(-5).join('\n'); // Last 5 lines for PENDING
  
  // Test all patterns against recent buffer (consistent with detection logic)
  const patternTests = patterns.map(p => ({
    pattern: p.pattern,
    description: p.description,
    matches: p.regex.test(recentLines), // Use same data source as detection
    expectedState: p.expectedState
  }));
  
  // PRIORITY 1: Check for PENDING patterns in recent lines (immediate response needed)
  const pendingPatterns = patterns.filter(p => p.expectedState === 'PENDING');
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
  const workingPatterns = patterns.filter(p => p.expectedState === 'WORKING');
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

// Back-compat export for existing imports
export function detectClaudeState(line, recentOutput = '') {
  return detectState('claude', line, recentOutput);
}
