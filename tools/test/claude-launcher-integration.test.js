#!/usr/bin/env node

/**
 * Integration test for Claude network detection launcher
 * Verifies the launcher can intercept Claude's network calls
 * Used in CI/CD to ensure Phase 1 implementation is working
 * 
 * Converted to Vitest format for better testing framework integration
 */

import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Claude Network Detection Launcher', () => {
    test('Claude launcher file exists', async () => {
        // Manual test: ls -la tools/lib/claude-launcher.cjs
        // Should show the launcher file exists with proper permissions
        // Expected: -rw-r--r-- ... tools/lib/claude-launcher.cjs
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        expect(fs.existsSync(launcherPath)).toBe(true);
    });

    test('Claude dependency is installed', async () => {
        // Manual test: npm list @anthropic-ai/claude-code
        // Should show: @anthropic-ai/claude-code@X.X.X
        //
        // Manual test: ls -la node_modules/@anthropic-ai/claude-code/cli.js
        // Should show: -rw-r--r-- ... node_modules/@anthropic-ai/claude-code/cli.js
        // This verifies both the dependency is installed AND the CLI entry point exists
        const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        expect(packageJson.dependencies['@anthropic-ai/claude-code']).toBeDefined();
        
        const claudeModulePath = path.join(__dirname, '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
        expect(fs.existsSync(claudeModulePath)).toBe(true);
    });

    test('Claude launcher starts correctly', async () => {
        // Manual test: node tools/lib/claude-launcher.cjs --help
        // Should start Claude and show help text containing "Claude Code"
        // Should exit with code 0 (success)
        // Should NOT show any error messages about missing modules
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        
        const result = await new Promise((resolve, reject) => {
            const child = spawn('node', [launcherPath, '--help'], {
                timeout: 8000
            });
            
            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            child.on('exit', (code) => {
                resolve({ code, output });
            });
            
            child.on('error', (error) => {
                reject(new Error(`Launcher failed to start: ${error.message}`));
            });
            
            // Timeout
            setTimeout(() => {
                child.kill();
                reject(new Error('Launcher timeout'));
            }, 7000);
        });

        expect(result.code).toBe(0);
        expect(result.output).toContain('Claude Code');
    });

    test('Network spy messages work', async () => {
        // Manual test: node tools/lib/claude-launcher.cjs --print 3>&1 1>/dev/null 2>&1
        // Then type "hello" and press Enter in the Claude prompt
        // Should see JSON messages on stdout like:
        // {"type":"fetch-start","id":1,"hostname":"api.anthropic.com","path":"/v1/messages","method":"POST","timestamp":...}
        // {"type":"fetch-end","id":1,"timestamp":...}
        //
        // The "3>&1 1>/dev/null 2>&1" redirects fd 3 to stdout while hiding normal output
        // This lets you see ONLY the spy messages from our launcher
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        
        const result = await new Promise((resolve, reject) => {
            const child = spawn('node', [launcherPath, '--print'], {
                stdio: ['pipe', 'ignore', 'ignore', 'pipe'], // fd 3 for spy messages
                timeout: 15000
            });
            
            let spyMessageCount = 0;
            let hasAnthropicCall = false;
            
            // Read spy messages from fd 3
            if (child.stdio[3]) {
                child.stdio[3].on('data', (data) => {
                    const lines = data.toString().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const message = JSON.parse(line);
                            if (message.type === 'fetch-start' || message.type === 'fetch-end') {
                                spyMessageCount++;
                                // Check if it's an Anthropic API call
                                if (message.hostname && 
                                    (message.hostname.includes('anthropic.com') || 
                                     message.hostname.includes('claude.ai'))) {
                                    hasAnthropicCall = true;
                                }
                            }
                        } catch (e) {
                            // Ignore non-JSON lines
                        }
                    }
                });
            }
            
            // Send a test prompt to trigger API calls
            child.stdin.write('hello\n');
            child.stdin.end();
            
            child.on('exit', () => {
                resolve({ spyMessageCount, hasAnthropicCall });
            });
            
            child.on('error', (error) => {
                reject(new Error(`Spy test failed: ${error.message}`));
            });
            
            // Timeout with partial success check
            setTimeout(() => {
                child.kill();
                resolve({ spyMessageCount, hasAnthropicCall });
            }, 12000);
        });

        expect(result.spyMessageCount).toBeGreaterThan(0);
        expect(result.hasAnthropicCall).toBe(true);
    }, 20000); // Increase timeout for this test
});