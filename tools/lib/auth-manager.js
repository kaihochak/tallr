import fs from 'fs';
import path from 'path';
import os from 'os';

// Get auth token from file or environment
export function getAuthToken() {
  // Check environment variables first (highest priority)
  if (process.env.TALLR_TOKEN) {
    return process.env.TALLR_TOKEN;
  }
  
  // Try to read from auth token file (same location as Rust backend)
  try {
    const appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Tallr');
    const tokenFile = path.join(appDataDir, 'auth.token');
    
    if (fs.existsSync(tokenFile)) {
      const token = fs.readFileSync(tokenFile, 'utf8').trim();
      if (token) {
        return token;
      }
    }
  } catch (error) {
    console.error('[CLI AUTH] ❌ Failed to read auth token file:', error.message);
    if (process.env.DEBUG) {
      console.error('[CLI AUTH] Full error details:', error);
    }
  }
  
  // No fallback - authentication required
  throw new Error('Authentication required. Please start the Tallr application first.');
}

// Simple gateway detection for Tallr backend
export function detectTallrGateway() {
  if (process.env.TALLR_GATEWAY) {
    return process.env.TALLR_GATEWAY;
  }
  
  // Use consistent port 4317 for both dev and prod
  return 'http://127.0.0.1:4317';
}