#!/usr/bin/env node

/**
 * Test script to verify HTTP authentication is working
 */

const http = require('http');

function makeRequest(token, description) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 4317,
      path: '/v1/tasks/upsert',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = http.request(options, (res) => {
      console.log(`${description}: ${res.statusCode} ${res.statusMessage}`);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (err) => {
      console.log(`${description}: Error - ${err.message}`);
      resolve({ status: 'error', error: err.message });
    });

    // Test payload
    const testData = {
      project: { name: "test-project", repoPath: "/tmp/test" },
      task: { id: "test-123", agent: "test", title: "Test Task", state: "IDLE" }
    };

    req.write(JSON.stringify(testData));
    req.end();
  });
}

async function testAuthentication() {
  console.log('Testing HTTP Authentication...\n');
  
  // Test 1: No token (should fail with 401)
  await makeRequest(null, 'Request without token');
  
  // Test 2: Wrong token (should fail with 401)  
  await makeRequest('wrong-token', 'Request with wrong token');
  
  // Test 3: Default token (should work)
  await makeRequest('tallr-secure-default', 'Request with default token');
  
  console.log('\nTesting complete!');
  console.log('Expected results:');
  console.log('- No token: 401 Unauthorized');
  console.log('- Wrong token: 401 Unauthorized'); 
  console.log('- Default token: 200 OK or connection error (if server not running)');
}

testAuthentication();