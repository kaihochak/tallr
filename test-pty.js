#!/usr/bin/env node

/**
 * PTY Test Script - Verify if PTY solves Claude CLI interactive problem
 * 
 * This script tests whether using node-pty allows Claude CLI to run
 * in interactive mode while still allowing us to monitor output.
 * 
 * Usage: node test-pty.js
 * 
 * Expected behavior:
 * - Claude should start interactive session (no error about input)
 * - User can type and interact normally
 * - We can monitor output for notification patterns
 */

import pty from 'node-pty';

console.log('🧪 Testing PTY approach with Claude CLI...');
console.log('📝 Expected: Interactive Claude session starts without errors');
console.log('❌ Current issue: "Input must be provided either through stdin..."');
console.log('🔍 Monitoring for notification patterns (Approve?, Error:, etc.)');
console.log('');

// Create PTY process for Claude
const ptyProcess = pty.spawn('claude', [], {
  name: 'xterm-color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 30,
  cwd: process.cwd(),
  env: process.env
});

console.log('🚀 Starting Claude via PTY...');
console.log('');

// Monitor output for both display and pattern detection
ptyProcess.on('data', (data) => {
  // Display output to user (normal terminal behavior)
  process.stdout.write(data);
  
  // Monitor for notification patterns (Tally functionality)
  const output = data.toString();
  
  if (output.includes('Approve?') || output.includes('[y/N]')) {
    console.log('\n🔔 [TALLY WOULD SEND NOTIFICATION: User approval needed]');
  }
  
  if (output.includes('Error:') || output.includes('Failed:')) {
    console.log('\n❌ [TALLY WOULD SEND NOTIFICATION: Error detected]');
  }
  
  if (output.includes('Done') || output.includes('Complete')) {
    console.log('\n✅ [TALLY WOULD UPDATE: Task completed]');
  }
});

// Forward user input to Claude (normal terminal behavior)
process.stdin.setRawMode(true);
process.stdin.on('data', (data) => {
  ptyProcess.write(data);
});

// Handle process exit
ptyProcess.on('exit', (code, signal) => {
  console.log('\n');
  console.log('📊 Test Results:');
  console.log(`   Exit code: ${code}`);
  console.log(`   Signal: ${signal}`);
  
  if (code === 0) {
    console.log('✅ PTY approach appears to work!');
    console.log('🎯 Next step: Implement PTY in tl-wrap.js');
  } else {
    console.log('❌ PTY approach failed');
    console.log('🤔 Need to investigate alternative solutions');
  }
  
  process.exit(code);
});

// Handle errors
ptyProcess.on('error', (error) => {
  console.error('\n❌ PTY Error:', error.message);
  console.log('💡 Make sure Claude CLI is installed and accessible');
  process.exit(1);
});

// Cleanup on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  ptyProcess.kill();
  process.exit(0);
});

console.log('💡 Tip: Try typing a question like "write a hello world function"');
console.log('🛑 Press Ctrl+C to exit test');
console.log('');