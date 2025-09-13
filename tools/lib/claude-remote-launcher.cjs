#!/usr/bin/env node
/*
 * Claude Remote Launcher (Phase 1/2 spy inside SDK child process)
 * - Patches global.fetch to emit fd 3 telemetry (fetch-start/end)
 * - Then loads the official Claude Code CLI in the same process
 *
 * This file is used via SDK option `pathToClaudeCodeExecutable` so that
 * network interception runs in the process that performs the requests.
 */

const fs = require('fs');

function writeMessage(message) {
  try {
    fs.writeSync(3, JSON.stringify(message) + '\n');
  } catch (_) {}
}

const originalFetch = global.fetch;
let fetchCounter = 0;

global.fetch = function(...args) {
  const id = ++fetchCounter;
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
  const method = args[1]?.method || 'GET';

  let hostname = '';
  let path = '';
  try {
    const urlObj = new URL(url, 'http://localhost');
    hostname = urlObj.hostname;
    path = urlObj.pathname;
  } catch (e) {
    hostname = 'unknown';
    path = url;
  }

  if (hostname.includes('anthropic.com') || hostname.includes('claude.ai')) {
    writeMessage({ type: 'fetch-start', id, hostname, path, method, timestamp: Date.now() });
  }

  const p = originalFetch(...args);
  if (hostname.includes('anthropic.com') || hostname.includes('claude.ai')) {
    const sendEnd = () => writeMessage({ type: 'fetch-end', id, timestamp: Date.now() });
    p.then(sendEnd, sendEnd);
  }
  return p;
};

Object.defineProperty(global.fetch, 'name', { value: 'fetch' });
Object.defineProperty(global.fetch, 'length', { value: originalFetch.length });

// Load Claude CLI inside this process (so our fetch patch applies)
import('@anthropic-ai/claude-code/cli.js');
