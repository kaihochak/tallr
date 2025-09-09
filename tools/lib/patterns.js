/**
 * Pattern Detection
 *
 * Handles pattern matching for different AI CLIs (Claude, Codex, Gemini)
 */

import stripAnsi from 'strip-ansi';

export const MAX_BUFFER_SIZE = 10000;

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

// Codex patterns – broaden PENDING coverage; keep WORKING conservative
const CODEX_PATTERNS = [
  // PENDING
  {
    pattern: 'yes/no',
    regex: /yes\/no/i,
    description: 'Codex yes/no prompt detection',
    expectedState: 'PENDING'
  },
  {
    pattern: '▌ Yes   No',
    regex: /▌\s+Yes\s+No/i,
    description: 'Codex Yes/No selection prompt detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'Yes and No on same line',
    regex: /\bYes\b.*\bNo\b/i,
    description: 'Codex Yes/No selection (looser spacing)',
    expectedState: 'PENDING'
  },
  {
    pattern: 'Allow command? prompt',
    regex: /Allow command\?/i,
    description: 'Codex allow command confirmation',
    expectedState: 'PENDING'
  },
  {
    pattern: 'Do not run the command',
    regex: /Do not run the command/i,
    description: 'Codex negative command advisory',
    expectedState: 'PENDING'
  },
  // WORKING
  {
    pattern: 'Esc to interrupt',
    regex: /Esc to interrupt/i,
    description: 'Codex working state detection',
    expectedState: 'WORKING'
  },
  {
    pattern: '▌ Working',
    regex: /▌\s*Working/i,
    description: 'Codex explicit working indicator',
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
  const recentFewLines = recentOutput.split('\n').slice(-10).join('\n'); // Last 10 lines for PENDING
  
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
      patternTests,
      detectionWindow: recentFewLines  // Add for debug visibility
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
      patternTests,
      detectionWindow: recentLines  // Add for debug visibility
    };
  }
  
  // PRIORITY 3: Enhanced IDLE detection with better confidence assessment
  const idleConfidence = assessIdleConfidence(cleanLine, recentOutput);
  
  return {
    state: 'IDLE',
    details: cleanLine,
    confidence: idleConfidence,
    patternTests,
    detectionWindow: recentLines  // Add for debug visibility
  };
}

/**
 * Assess confidence level for IDLE state based on completion indicators
 */
function assessIdleConfidence(line, recentOutput) {
  // High-confidence IDLE indicators
  const completionIndicators = [
    /^[~/].*\$\s*$/,           // Shell prompt ending with $
    /^\S+@\S+.*\$\s*$/,       // User@host prompt
    /^.*%\s*$/,               // Zsh prompt ending with %
    /Process completed/i,      // Explicit completion messages
    /Command finished/i,
    /Done\./,
    /Success/i,
    /✓/,                      // Checkmark symbols
    /^$\s*$/                  // Empty line after processing
  ];
  
  // Check current line for high-confidence indicators
  if (completionIndicators.some(pattern => pattern.test(line))) {
    return 'high';
  }
  
  // Medium confidence if recent output suggests completion
  const recentLines = recentOutput.split('\n').slice(-5);
  const hasRecentActivity = recentLines.some(recentLine => {
    const clean = stripAnsi(recentLine).trim();
    return clean.length > 0 && completionIndicators.some(pattern => pattern.test(clean));
  });
  
  if (hasRecentActivity) {
    return 'medium';
  }
  
  // Check if recent output is just quiet (no active patterns for a while)
  const recentActiveLines = recentLines.filter(recentLine => {
    const clean = stripAnsi(recentLine).trim();
    return clean.length > 10; // Has substantial content
  });
  
  // If little recent activity, medium confidence for IDLE
  if (recentActiveLines.length < 2) {
    return 'medium';
  }
  
  // Default to low confidence
  return 'low';
}
