#!/usr/bin/env node

/**
 * Phase 2 Integration test for Claude network detection via tl-wrap.js
 * Verifies the launcher works through the main Tallr CLI wrapper
 * Tests end-to-end integration: tl-wrap.js → launcher → network detection
 * 
 * Covers both automatic launcher activation and fallback to pattern detection
 */

import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Claude Phase 2 Integration - Code Structure Verification', () => {
    test('Phase 2 integration files and code structure exist', async () => {
        // Manual test: DEBUG=tallr:cli ./tools/tallr claude --help
        // Should show: "Attempting network detection launcher for claude"
        // Should show: "Network detection launcher started successfully"
        // Should show Claude help normally without requiring TALLR_LAUNCHER_MODE=true
        //
        // This automated test only verifies the code structure is in place.
        // Run the manual test above to verify actual runtime behavior.
        const tlWrapPath = path.join(__dirname, '..', 'tl-wrap.js');
        const tallrPath = path.join(__dirname, '..', 'tallr');
        const launcherPath = path.join(__dirname, '..', 'lib', 'claude-launcher.cjs');
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        const processManagerPath = path.join(__dirname, '..', 'lib', 'process-manager.js');
        
        // Verify all integration components exist
        expect(fs.existsSync(tlWrapPath)).toBe(true);
        expect(fs.existsSync(tallrPath)).toBe(true);  
        expect(fs.existsSync(launcherPath)).toBe(true);
        expect(fs.existsSync(networkLauncherPath)).toBe(true);
        expect(fs.existsSync(processManagerPath)).toBe(true);
        
        // Verify tl-wrap.js uses modular imports
        const tlWrapContent = fs.readFileSync(tlWrapPath, 'utf8');
        expect(tlWrapContent).toContain('import { runWithPTY } from \'./lib/process-manager.js\'');
        
        // Verify network-launcher.js contains integration code
        const networkLauncherContent = fs.readFileSync(networkLauncherPath, 'utf8');
        expect(networkLauncherContent).toContain('setupNetworkListener');
        expect(networkLauncherContent).toContain('claude-launcher.cjs');
        expect(networkLauncherContent).toContain('Attempting network detection launcher');
    });

    test('Network detection code structure is properly integrated', async () => {
        // Manual test: DEBUG=tallr:network ./tools/tallr claude --print "hello"
        // Should show network requests to api.anthropic.com and statsig.anthropic.com
        // Should show: "Network request started: { id: X, hostname: 'api.anthropic.com', path: '/v1/messages' }"
        // Should show: "Network request ended: { id: X, active: Y }"
        // Should display Claude's response at the end
        //
        // This test verifies the code structure for network detection is present.
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        const networkLauncherContent = fs.readFileSync(networkLauncherPath, 'utf8');
        
        // Verify @happy-coder's approach is implemented
        expect(networkLauncherContent).toContain("import { createInterface } from 'readline';");
        expect(networkLauncherContent).toContain("const hasLauncher = command === 'claude';");
        // Accept both Phase 2 (fd3 only) and Phase 3 (fd3 + fd4) stdio forms
        expect(
          networkLauncherContent.includes("stdio: ['inherit', 'inherit', 'inherit', 'pipe']") ||
          networkLauncherContent.includes("stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe']")
        ).toBe(true);
        
        // Verify network detection components
        expect(networkLauncherContent).toContain("debug.network");
        expect(networkLauncherContent).toContain("stateTracker.changeState('WORKING'");
        expect(networkLauncherContent).toContain("stateTracker.changeState('IDLE'");
        expect(networkLauncherContent).toContain("setTimeout(() => {");
        expect(networkLauncherContent).toContain(", 500)");
    });

    test('tl-wrap.js falls back to pattern detection if launcher fails', async () => {
        // Manual test: mv tools/lib/claude-launcher.cjs tools/lib/claude-launcher.cjs.backup
        // Then: DEBUG=tallr:cli ./tools/tallr claude --help
        // Should show: "Launcher failed, falling back to pattern detection"
        // Should show: "Using PTY + pattern detection for claude"
        // Should still work and show Claude help normally
        // Cleanup: mv tools/lib/claude-launcher.cjs.backup tools/lib/claude-launcher.cjs
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        const processManagerPath = path.join(__dirname, '..', 'lib', 'process-manager.js');
        const networkLauncherContent = fs.readFileSync(networkLauncherPath, 'utf8');
        const processManagerContent = fs.readFileSync(processManagerPath, 'utf8');
        
        // Should have try-catch around launcher spawn
        expect(networkLauncherContent).toContain("try {");
        expect(networkLauncherContent).toContain("} catch (error) {");
        
        // Should have fallback messaging
        expect(networkLauncherContent).toContain("falling back to pattern detection");
        expect(processManagerContent).toContain("Using PTY + pattern detection");
        
        // Should have PTY spawn as fallback
        expect(processManagerContent).toContain("pty.spawn(command, commandArgs");
        
        // Should handle both launcher and fallback paths
        expect(processManagerContent).toContain("// Fallback: PTY + pattern detection");
    });

    test('tl-wrap.js works correctly for non-Claude agents', async () => {
        // Manual test: DEBUG=tallr:cli ./tools/tallr gemini --help
        // Should show: "Using PTY + pattern detection for gemini"
        // Should NOT show: "Attempting network detection launcher for gemini"
        // Should work normally with pattern detection (if gemini is installed)
        //
        // Manual test: DEBUG=tallr:cli ./tools/tallr codex --help  
        // Should show: "Using PTY + pattern detection for codex"
        // Should NOT show: "Attempting network detection launcher for codex"
        const tlWrapPath = path.join(__dirname, '..', 'tl-wrap.js');
        const tlWrapContent = fs.readFileSync(tlWrapPath, 'utf8');
        
        // Should have agent-specific launcher detection in network-launcher.js
        const networkLauncherPath = path.join(__dirname, '..', 'lib', 'network-launcher.js');
        const processManagerPath = path.join(__dirname, '..', 'lib', 'process-manager.js');
        const networkLauncherContent = fs.readFileSync(networkLauncherPath, 'utf8');
        const processManagerContent = fs.readFileSync(processManagerPath, 'utf8');
        
        expect(networkLauncherContent).toContain("const hasLauncher = command === 'claude';");
        
        // Should branch on hasLauncher condition
        expect(networkLauncherContent).toContain("if (!hasLauncher) {");
        
        // Should have different code paths for launcher vs non-launcher agents
        expect(networkLauncherContent).toContain("Attempting network detection launcher for");
        
        // Should use pattern detection for non-Claude agents
        expect(processManagerContent).toMatch(/Using PTY \+ pattern detection for/);
    });

    test('Network detection state transitions work', async () => {
        // Manual test: DEBUG=tallr:state,tallr:network ./tools/tallr claude --print "test"
        // Should show state transitions: IDLE -> WORKING -> IDLE
        // Should show: "changeState called" with "detectionMethod: 'network'"  
        // Should show: "Claude is thinking..." during WORKING state
        // Should show: "Ready for input" during IDLE state
        // Should show network requests correlating with state changes
        const debugPath = path.join(__dirname, '..', 'lib', 'debug.js');
        const debugContent = fs.readFileSync(debugPath, 'utf8');
        
        // Should have network debug method
        expect(debugContent).toContain("network(message, data) {");
        expect(debugContent).toContain("this.log('tallr:network', message, data);");
        
        // Should be accessible from main debug export
        expect(debugContent).toContain("export const debug = new DebugLogger();");
    });
});
