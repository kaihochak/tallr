#!/usr/bin/env node

/**
 * Phase 3 PENDING Detection test for Claude network detection
 * Verifies API response analysis can detect tool use requests
 * Tests Phase 3 enhancement to @happy-coder's network interception approach
 * 
 * Follows the same pattern as Phase 1 & 2 tests: code structure + manual instructions
 */

import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Claude Phase 3 PENDING Detection (SDK canCallTool)', () => {
    test('Phase 3 PENDING detection code structure exists', async () => {
        // Manual test: DEBUG=tallr ./tools/tallr claude "create test.txt file"
        // Should show a permission request on fd 3:
        // { type: 'permission-request', id, tool: { name: 'write_file', args: {...} } }
        // tl-wrap should set PENDING with detectionMethod: 'network'
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        
        // Verify Phase 3 files exist
        expect(fs.existsSync(launcherPath)).toBe(true);
        expect(fs.existsSync(networkLauncherPath)).toBe(true);
        
        const launcherContent = fs.readFileSync(launcherPath, 'utf8');
        const networkContent = fs.readFileSync(networkLauncherPath, 'utf8');
        
        // Verify SDK callback + fd4 control in launcher
        expect(launcherContent).toContain('canCallTool');
        expect(launcherContent).toContain('permission-request');
        expect(launcherContent).toContain("createReadStream(null, { fd: 4 }");
        expect(launcherContent).toContain('permission-response');
        // Verify in-IDE approval path via /allow and /deny commands
        expect(launcherContent).toContain("type /allow or /deny");
        
        // Verify network-launcher handles PENDING messages and fd4 spawn
        expect(networkContent).toContain("case 'permission-request':");
        expect(networkContent).toContain("stateTracker.changeState('PENDING'");
        expect(networkContent).toContain("Claude needs permission for tools");
        expect(networkContent).toContain("'inherit', 'inherit', 'inherit', 'pipe', 'pipe'");

        // Verify early permission prompt handling
        expect(networkContent).toContain("case 'permission-prompt':");
        expect(networkContent).toContain("Claude is asking for permission");

        // Verify conversation message forwarding to backend
        expect(networkContent).toContain("case 'claude-message':");
        expect(networkContent).toContain("updateTaskDetails");
    });

    test('Phase 3 enhances existing network detection without breaking it', async () => {
        // Manual test: DEBUG=tallr ./tools/tallr claude "just say hello"
        // Should NOT show any permission-request messages
        // Should show normal WORKING → IDLE transition via network detection
        // Should still show fetch-start/fetch-end messages from Phase 1 & 2
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        const launcherContent = fs.readFileSync(launcherPath, 'utf8');
        
        // Verify Phase 1 & 2 functionality preserved
        expect(launcherContent).toContain('fetch-start');
        expect(launcherContent).toContain('fetch-end');
        expect(launcherContent).toContain('originalFetch');
        expect(launcherContent).toContain('@happy-coder');
        
        // Verify both success and error paths preserved
        expect(launcherContent).toContain('.then(async (response) => {');
        expect(launcherContent).toContain('.catch((error) => {');
    });

    test('Phase 3 PENDING detection infrastructure works', async () => {
        // Manual test: DEBUG=tallr ./tools/tallr claude "write a file called phase3-test.txt"
        // Should see permission-request messages when Claude wants to use tools
        // Should transition to PENDING state via network detection
        // 
        // This automated test verifies the spy message infrastructure is in place.
        // Actual PENDING detection requires real Claude API responses with tool use.
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        
        const result = await new Promise((resolve, reject) => {
            const child = spawn('node', [launcherPath, '--print'], {
                stdio: ['pipe', 'ignore', 'ignore', 'pipe'], // fd 3 for spy messages (no fd 4 in this test)
                timeout: 15000
            });
            
            let messageCount = 0;
            let hasPermissionRequest = false;
            
            // Read spy messages from fd 3
            if (child.stdio[3]) {
                child.stdio[3].on('data', (data) => {
                    const lines = data.toString().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const message = JSON.parse(line);
                            if (message.type === 'fetch-start' || 
                                message.type === 'fetch-end' || 
                                message.type === 'permission-request') {
                                messageCount++;
                                if (message.type === 'permission-request') {
                                    hasPermissionRequest = true;
                                }
                            }
                        } catch (e) {
                            // Ignore non-JSON lines
                        }
                    }
                });
            }
            
            // Send a simple prompt first (shouldn't trigger PENDING)
            child.stdin.write('hello\n');
            child.stdin.end();
            
            child.on('exit', () => {
                resolve({ messageCount, hasPermissionRequest });
            });
            
            child.on('error', (error) => {
                reject(new Error(`Phase 3 test failed: ${error.message}`));
            });
            
            // Timeout with partial success check
            setTimeout(() => {
                child.kill();
                resolve({ messageCount, hasPermissionRequest });
            }, 12000);
        });

        // Should see network messages (Phase 1 & 2 working)
        expect(result.messageCount).toBeGreaterThan(0);
        
        // permission-request depends on Claude actually requesting tools
        // This simple "hello" test probably won't trigger it, so we just verify infrastructure exists
        expect(result.hasPermissionRequest).toBe(false); // Simple hello shouldn't need tools
    }, 20000);

    test('Phase 3 control channel (fd 4) is documented in code', async () => {
        // Manual test: DEBUG=tallr ./tools/tallr claude "create test.txt file"
        // Approve/deny from parent to validate the round-trip
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        const launcherContent = fs.readFileSync(launcherPath, 'utf8');
        expect(launcherContent).toContain('createReadStream(null, { fd: 4 }');
        expect(launcherContent).toContain('permission-response');
    });

    test('Phase 3 maintains backward compatibility', async () => {
        // Manual test: Test non-Claude agents still work with pattern detection:
        // DEBUG=tallr ./tools/tallr gemini "hello"  # Should use patterns, not network
        // DEBUG=tallr ./tools/tallr codex "hello"   # Should use patterns, not network
        // 
        // Test Claude fallback still works:
        // mv tools/lib/claude-launcher.cjs tools/lib/claude-launcher.cjs.backup
        // DEBUG=tallr ./tools/tallr claude "hello"  # Should fallback to patterns
        // mv tools/lib/claude-launcher.cjs.backup tools/lib/claude-launcher.cjs
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        const networkContent = fs.readFileSync(networkLauncherPath, 'utf8');
        
        // Verify Phase 3 only affects Claude
        expect(networkContent).toContain("const hasLauncher = command === 'claude';");
        expect(networkContent).toContain("if (!hasLauncher) {");
        
        // Verify fallback mechanism preserved
        expect(networkContent).toContain("try {");
        expect(networkContent).toContain("} catch (error) {");
        expect(networkContent).toContain("falling back to pattern detection");
        
        // Verify PENDING detection is additive to existing states
        expect(networkContent).toContain("case 'fetch-start':");
        expect(networkContent).toContain("case 'fetch-end':");
        expect(networkContent).toContain("case 'permission-request':");
    });
});
