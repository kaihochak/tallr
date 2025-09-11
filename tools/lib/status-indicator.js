/**
 * Status Indicator Utility
 * Shows detection method status to CLI users in a minimal, non-intrusive way
 */

/**
 * Check if terminal supports colors
 */
function supportsColor() {
  return process.stderr.isTTY && process.env.TERM !== 'dumb';
}

/**
 * Apply color to text if terminal supports it
 */
function colorize(text, colorCode) {
  if (!supportsColor()) {
    return text;
  }
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

/**
 * Show network detection status - used when launcher starts successfully
 */
export function showNetworkDetectionStatus(agent) {
  const greenCheck = colorize('✓', '32'); // Green
  const message = `[Tallr: Network Detection] ${greenCheck} ${agent} with real-time tracking`;
  console.error(message);
}

/**
 * Show pattern detection status - used when falling back to PTY + patterns
 */
export function showPatternDetectionStatus(agent) {
  const yellowLightning = colorize('⚡', '33'); // Yellow
  const message = `[Tallr: Pattern Detection] ${yellowLightning} ${agent} with pattern monitoring`;
  console.error(message);
}