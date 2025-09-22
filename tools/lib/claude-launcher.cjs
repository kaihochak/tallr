/*
 * Network interception based on @happy-coder's innovation
 * Original: https://github.com/happy-coder/happy-cli
 * Used under MIT license with attribution
 * 
 * Phase 3 Enhancement: PENDING detection via Claude SDK canCallTool callback
 * This launcher uses Claude SDK programmatically to detect tool permissions
 * while preserving Phase 1 & 2 network detection for WORKING/IDLE states.
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

// Phase 3: Permission handling state + control channel (fd 4)
const pendingPermissions = new Map();
let permissionCounter = 0;

// Try to open fd 4 as a control channel (parent → child)
try {
    const control = fs.createReadStream(null, { fd: 4 });
    let buffer = '';
    control.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            try {
                const msg = JSON.parse(line);
                if (msg && msg.type === 'permission-response') {
                    const resolver = pendingPermissions.get(msg.id);
                    if (resolver) {
                        pendingPermissions.delete(msg.id);
                        resolver(msg.decision === 'allow' 
                            ? { behavior: 'allow' }
                            : { behavior: 'deny', message: 'Denied by user' }
                        );
                    }
                }
            } catch (e) {
                // Ignore malformed lines
            }
        }
    });
    control.on('error', () => {
        // If control channel errors, permission requests will remain pending
    });
} catch (e) {
    // No control channel provided; permission requests will remain pending until process exits
}

// Phase 3: Handle tool permission requests via SDK callback
async function handleToolPermission(toolName, input) {
    const permissionId = ++permissionCounter;
    
    // Send PENDING state notification with tool details
    writeMessage({
        type: 'permission-request',
        id: permissionId,
        tool: { name: toolName, args: input },
        timestamp: Date.now()
    });
    
    // Inform local user how to approve/deny from IDE/terminal
    try {
        const preview = typeof input === 'object' ? JSON.stringify(input).slice(0, 200) : String(input);
        console.log(`\n[Tallr] Permission required for tool: ${toolName}`);
        if (preview) console.log(`[Tallr] Tool args: ${preview}${preview.length === 200 ? '…' : ''}`);
        console.log('[Tallr] Approve from Tallr UI, or type /allow or /deny here.');
    } catch {}
    
    // Wait for permission response from parent (fd 4)
    return new Promise((resolve) => {
        // Intentionally do not auto-approve. We wait for a decision from fd 4.
        // This will hold the session in PENDING until the parent responds.
        pendingPermissions.set(permissionId, resolve);
    });
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

    // Execute the original fetch
    const fetchPromise = originalFetch(...args);
    
    if (hostname.includes('anthropic.com') || hostname.includes('claude.ai')) {
        // Attach handlers to send fetch end event (Phase 1/2 behavior)
        fetchPromise
            .then(async (response) => {
                // Always send fetch-end (Phase 1/2 behavior preserved)
                writeMessage({
                    type: 'fetch-end',
                    id,
                    timestamp: Date.now()
                });
                
                return response; // Return original response to Claude
            })
            .catch((error) => {
                // Send fetch-end even on error (Phase 1/2 behavior preserved)
                writeMessage({
                    type: 'fetch-end',
                    id,
                    error: true,
                    timestamp: Date.now()
                });
                throw error; // Re-throw for Claude to handle
            });
    }
    
    // Return the original promise unchanged
    return fetchPromise;
};

// Preserve fetch properties (important for compatibility)
Object.defineProperty(global.fetch, 'name', { value: 'fetch' });
Object.defineProperty(global.fetch, 'length', { value: originalFetch.length });

// Phase 3: Use Claude SDK programmatically instead of just loading CLI
// Get command line arguments passed to launcher
const claudeArgs = process.argv.slice(2);

// Opt-in guard to keep default stable: TALLR_SDK_MODE=true or --sdk
const sdkOptIn = process.env.TALLR_SDK_MODE === 'true' || process.env.TALLR_SDK_MODE === '1' || claudeArgs.includes('--sdk');

if (!sdkOptIn) {
    import('@anthropic-ai/claude-code/cli.js');
} else {
Promise.resolve().then(async () => {
        const path = require('path');
        const { query } = await import('@anthropic-ai/claude-code');
        
        // Determine if we have a direct prompt (non-interactive) or need interactive mode
        const nonOptionArgs = claudeArgs.filter(arg => !arg.startsWith('--'));
        const hasDirectPrompt = nonOptionArgs.length > 0;
        
        let promptInput;
        if (hasDirectPrompt) {
            // For non-interactive mode with canCallTool, we need AsyncIterable not string
            // Based on Happy Coder's requirement: canCallTool needs --input-format stream-json
            promptInput = {
                async *[Symbol.asyncIterator]() {
                    yield { role: 'user', content: nonOptionArgs[0] };
                }
            };
        } else {
            // Create interactive prompt iterator
            promptInput = {
                async *[Symbol.asyncIterator]() {
                    const readline = require('readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    
                    try {
                        while (true) {
                            const line = await new Promise(resolve => {
                                rl.question('', resolve);
                            });
                            
                            const trimmed = String(line || '').trim();
                            if (!trimmed) continue;

                            // If there's a pending permission, allow inline approval from IDE
                            if (pendingPermissions.size > 0 && (trimmed === '/allow' || trimmed === '/deny')) {
                                // Resolve the oldest pending permission
                                const [firstId] = pendingPermissions.keys();
                                const resolver = pendingPermissions.get(firstId);
                                if (resolver) {
                                    pendingPermissions.delete(firstId);
                                    resolver(trimmed === '/allow' ? { behavior: 'allow' }
                                                                  : { behavior: 'deny', message: 'Denied from IDE' });
                                    // Notify parent via fd 3 (optional)
                                    writeMessage({ type: 'permission-update', id: firstId, status: trimmed === '/allow' ? 'approved' : 'denied' });
                                    continue; // Do not send this as a user message
                                }
                            }

                            // Regular user message to Claude
                            yield { role: 'user', content: line };
                        }
                    } finally {
                        rl.close();
                    }
                }
            };
        }
        
        // Ensure remote launcher is executable to avoid EACCES
        const remoteLauncherPath = path.join(__dirname, 'claude-remote-launcher.cjs');
        try { fs.chmodSync(remoteLauncherPath, 0o755); } catch {}

        // Start SDK query with canCallTool callback
        try {
            const queryInstance = query({
                prompt: promptInput,
                options: {
                    canCallTool: handleToolPermission,
                    cwd: process.cwd(),
                    permissionMode: 'default',
                    executable: 'node',
                    // Ensure network interception runs inside the SDK child process
                    pathToClaudeCodeExecutable: remoteLauncherPath
                }
            });
            
            // Handle messages from Claude
            for await (const message of queryInstance) {
                // Output Claude's responses to stdout and forward to parent (fd 3)
                if (message.type === 'assistant' && message.message?.content) {
                    let aggregatedText = '';
                    for (const content of message.message.content) {
                        if (content.type === 'text') {
                            aggregatedText += content.text;
                        }
                    }
                    if (aggregatedText) {
                        const ts = Date.now();
                        // Emit a structured message event to parent for UI consumption
                        writeMessage({
                            type: 'claude-message',
                            role: 'assistant',
                            text: aggregatedText,
                            timestamp: ts
                        });

                        // Heuristic: detect when Claude is asking for permission BEFORE attempting tools
                        // Common patterns include "need permission", "Would you like me to proceed?", etc.
                        const lower = aggregatedText.toLowerCase();
                        const looksLikePermissionPrompt = (
                            /need\s+permission/.test(lower) ||
                            /permission\s+to\s+(write|modify|create|run|replace)/.test(lower) ||
                            /would\s+you\s+like\s+me\s+to\s+proceed\??/.test(lower) ||
                            /do\s+you\s+want\s+me\s+to\s+proceed\??/.test(lower) ||
                            /should\s+i\s+proceed\??/.test(lower) ||
                            /i\s+can\s+proceed\s+if\s+you\s+approve/.test(lower) ||
                            /would\s+you\s+like\s+me\s+to\s+(write|modify|create|run|replace)/.test(lower) ||
                            /would\s+you\s+like\s+me\s+to\s+replace/.test(lower) ||
                            /should\s+i\s+(write|modify|create|run|replace)/.test(lower) ||
                            /do\s+you\s+want\s+me\s+to\s+(write|modify|create|run|replace)/.test(lower)
                        );
                        if (looksLikePermissionPrompt) {
                            writeMessage({
                                type: 'permission-prompt',
                                text: aggregatedText.slice(0, 500),
                                timestamp: ts
                            });
                        }

                        // Preserve console output for terminal users
                        console.log(aggregatedText);
                    }
                }
            }
        } catch (error) {
            console.error('Claude SDK error, falling back to CLI:', error && (error.message || error));
            import('@anthropic-ai/claude-code/cli.js');
        }
    });
}
