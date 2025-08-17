/**
 * Claude Pattern Detection
 * 
 * Handles pattern matching for Claude CLI state detection
 */

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
 * Clean ANSI codes from terminal output for DISPLAY
 * Preserves formatting like newlines for better user readability
 */
export function cleanANSIForDisplay(text) {
  return text
    // First normalize line endings BEFORE removing other control characters
    .replace(/\r\n/g, '\n')  // Windows line endings to Unix
    .replace(/\r/g, '\n')    // Mac line endings to Unix
    // Remove all ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Most ANSI sequences
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, '') // OSC sequences
    .replace(/\x1b[=>]/g, '') // Application keypad
    .replace(/\x1b[()][AB012]/g, '') // Character set sequences
    // Remove control characters but PRESERVE newlines (\n = 0x0A)
    // Range excludes: 0x09 (tab), 0x0A (LF), 0x0D (CR)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove box-drawing characters
    .replace(/[│─┌┐└┘├┤┬┴┼╭╮╰╯]/g, '')
    // Clean up whitespace but PRESERVE newlines
    .replace(/\t/g, '  ')    // Convert tabs to spaces
    // DON'T collapse all whitespace - preserve line structure
    .replace(/[ ]+/g, ' ')   // Only collapse multiple spaces, keep newlines
    .replace(/\n[ ]+/g, '\n') // Remove leading spaces on new lines
    .replace(/[ ]+\n/g, '\n') // Remove trailing spaces on lines
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines to max 2
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
    pattern: '❯ 1\\.|❯ 2\\.|❯ 3\\.',
    regex: /❯\s*[123]\./,
    description: 'Claude numbered options detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'Would you like to proceed\\?',
    regex: /Would you like to proceed\?/i,
    description: 'Proceed confirmation detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'Approve\\?',
    regex: /Approve\?/i,
    description: 'Approval prompt detection',
    expectedState: 'PENDING'
  },
  {
    pattern: '\\[y/N\\]|\\[Y/n\\]',
    regex: /\[(y\/N|Y\/n)\]/,
    description: 'Y/N choice detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'esc to interrupt',
    regex: /esc to interrupt/i,
    description: 'Working state detection',
    expectedState: 'WORKING'
  },
  {
    pattern: 'working\\.\\.\\.|…',
    regex: /(working\.\.\.)|…/i,
    description: 'Working indicator detection',
    expectedState: 'WORKING'
  },
  {
    pattern: 'error|failed|exception',
    regex: /error|failed|exception/i,
    description: 'Error detection',
    expectedState: 'ERROR'
  },
  {
    pattern: 'continue\\?|proceed\\?',
    regex: /(continue|proceed)\?/i,
    description: 'General confirmation detection',
    expectedState: 'PENDING'
  },
  {
    pattern: 'claude.*thinking|analyzing',
    regex: /(claude.*(thinking|analyzing))|thinking|analyzing/i,
    description: 'Claude thinking state',
    expectedState: 'WORKING'
  }
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
  
  // WORKING: Claude is actively processing (check first as most important)
  if (cleanLine.includes('esc to interrupt') || contextBuffer.includes('esc to interrupt')) {
    return { 
      state: 'WORKING', 
      details: cleanLine, 
      confidence: 'high',
      patternTests 
    };
  }
  
  // PENDING: Claude is waiting for user input - check multiple patterns
  const pendingCheck = cleanLine.includes('❯') || 
      cleanLine.includes('Do you want to proceed') ||
      cleanLine.includes('Would you like to proceed') ||
      cleanLine.includes('Approve?') ||
      cleanLine.includes('[y/N]') ||
      recentOutput.includes('❯ 1.') ||
      recentOutput.includes('❯ 2.') ||
      recentOutput.includes('❯ 3.') ||
      recentOutput.includes('Do you want to proceed') ||
      recentOutput.includes('Would you like to proceed');
      
  if (pendingCheck) {
    return { 
      state: 'PENDING', 
      details: cleanLine, 
      confidence: 'high',
      patternTests 
    };
  }
  
  // IDLE: Only transition to IDLE with very conservative logic
  // Don't be aggressive - only detect IDLE when we have strong evidence
  // For now, don't auto-transition to IDLE at all - let explicit signals handle it
  
  return { patternTests };
}