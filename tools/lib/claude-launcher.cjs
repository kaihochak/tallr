/*
 * Network interception based on @happy-coder's innovation
 * Original: https://github.com/happy-coder/happy-cli
 * Used under MIT license with attribution
 * 
 * This launcher intercepts Claude's network calls to detect state changes
 * without interfering with normal Claude operation.
 */

const fs = require('fs');

// Helper to write JSON messages to fd 3
// @happy-coder's fd 3 communication technique
function writeMessage(message) {
    try {
        fs.writeSync(3, JSON.stringify(message) + '\n');
    } catch (err) {
        // fd 3 not available, ignore
    }
}

// @happy-coder's core innovation: pre-load network interception
const originalFetch = global.fetch;
let fetchCounter = 0;

global.fetch = function(...args) {
    const id = ++fetchCounter;
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = args[1]?.method || 'GET';
    
    // Parse URL for privacy
    let hostname = '';
    let path = '';
    try {
        const urlObj = new URL(url, 'http://localhost');
        hostname = urlObj.hostname;
        path = urlObj.pathname;
    } catch (e) {
        // If URL parsing fails, use defaults
        hostname = 'unknown';
        path = url;
    }
    
    // Only track Claude's API calls to Anthropic
    if (hostname.includes('anthropic.com') || hostname.includes('claude.ai')) {
        // Send fetch start event
        writeMessage({
            type: 'fetch-start',
            id,
            hostname,
            path,
            method,
            timestamp: Date.now()
        });
    }

    // Execute the original fetch immediately
    const fetchPromise = originalFetch(...args);
    
    if (hostname.includes('anthropic.com') || hostname.includes('claude.ai')) {
        // Attach handlers to send fetch end event
        const sendEnd = () => {
            writeMessage({
                type: 'fetch-end',
                id,
                timestamp: Date.now()
            });
        };
        
        // Send end event on both success and failure
        fetchPromise.then(sendEnd, sendEnd);
    }
    
    // Return the original promise unchanged
    return fetchPromise;
};

// Preserve fetch properties (important for compatibility)
Object.defineProperty(global.fetch, 'name', { value: 'fetch' });
Object.defineProperty(global.fetch, 'length', { value: originalFetch.length });

// Load Claude AFTER we've set up spying
import('@anthropic-ai/claude-code/cli.js')