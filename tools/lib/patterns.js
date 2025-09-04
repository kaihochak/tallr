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

// Codex patterns - prioritize WORKING over PENDING when both present
const CODEX_PATTERNS = [
  // WORKING - check first for better priority
  {
    pattern: 'esc to interrupt',
    regex: /esc to interrupt/i,
    description: 'Codex working state detection',
    expectedState: 'WORKING'
  },
  {
    pattern: '▌ Working',
    regex: /▌\s*Working/i,
    description: 'Codex explicit working indicator',
    expectedState: 'WORKING'
  },
  // PENDING - more specific patterns
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
  
  // SIMPLIFIED: Use only last 5 lines for ALL detection - matches what debug shows
  const detectionWindow = recentOutput.split('\n').slice(-5).join('\n');
  
  // Check for strong completion indicators
  const hasStrongCompletion = /✓.*Applied patch|Success.*Updated.*files|All set\.|^Done\.|Task completed/i.test(detectionWindow);
  
  // Test all patterns against the SAME 5-line window
  const patternTests = patterns.map(p => ({
    pattern: p.pattern,
    description: p.description,
    matches: p.regex.test(detectionWindow),
    expectedState: p.expectedState
  }));
  
  // PRIORITY 1: Check for WORKING patterns first (active processing)
  const workingPatterns = patterns.filter(p => p.expectedState === 'WORKING');
  const hasWorking = workingPatterns.some(p => p.regex.test(detectionWindow));
  
  if (hasWorking && !hasStrongCompletion) {
    return {
      state: 'WORKING',
      details: cleanLine,
      confidence: 'high',
      patternTests,
      detectionWindow
    };
  }
  
  // PRIORITY 2: Check for PENDING patterns (needs user input)
  const pendingPatterns = patterns.filter(p => p.expectedState === 'PENDING');
  const hasPending = pendingPatterns.some(p => p.regex.test(detectionWindow));
  
  if (hasPending) {
    return {
      state: 'PENDING',
      details: cleanLine,
      confidence: 'high',
      patternTests,
      detectionWindow  // Include for debug visibility
    };
  }
  
  // PRIORITY 3: IDLE state (default)
  const idleConfidence = hasStrongCompletion ? 'high' : 'medium';
  
  return {
    state: 'IDLE',
    details: cleanLine,
    confidence: idleConfidence,
    patternTests,
    detectionWindow
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
