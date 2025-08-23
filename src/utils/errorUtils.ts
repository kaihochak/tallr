/**
 * Maps API errors to user-friendly messages
 */
export function getErrorMessage(error: Error | string, context?: string, isRetry = false): string {
  const errorMessage = error instanceof Error ? error.message : error;
  
  // Connection errors
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch')) {
    return 'Cannot connect to Tallr backend. Make sure the app is running.';
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout')) {
    return 'Connection timeout. Please check your connection.';
  }
  
  // Authentication errors
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('HTTP 401')) {
    return 'Authentication failed. Click retry to get a fresh token.';
  }
  
  // Server errors
  if (errorMessage.includes('500')) {
    return 'Server error. Please try again.';
  }
  
  // Retry-specific handling
  if (isRetry) {
    return `Failed to reconnect: ${errorMessage}`;
  }
  
  // Generic error with context
  if (context) {
    return `${context}: ${errorMessage}`;
  }
  
  return errorMessage;
}

/**
 * Maps retry-specific errors to user-friendly messages
 * @deprecated Use getErrorMessage(error, context, true) instead
 */
export function getRetryErrorMessage(error: Error | string): string {
  return getErrorMessage(error, undefined, true);
}

/**
 * Standardized error logging
 */
export function logError(context: string, error: Error | string, details?: any) {
  const errorMessage = error instanceof Error ? error.message : error;
  console.error(`[${context}] ${errorMessage}`, details || '');
}