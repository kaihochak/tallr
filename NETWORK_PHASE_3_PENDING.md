# ✅ Network Detection - Phase 3: PENDING via SDK canCallTool (CURRENT STATUS)

## Goal
Add accurate PENDING detection and user approval flow using Claude SDK’s `canCallTool` callback, while preserving Phase 1/2 WORKING/IDLE via fetch interception.

## Current Status (Stabilized)
- Default path: Phase 1/2 only (fetch-based WORKING/IDLE). SDK path is gated behind `TALLR_SDK_MODE=true` or `--sdk`.
- SDK path (Phase 3a) is available for testing: emits `permission-request` on tool attempt and early `permission-prompt` when Claude asks to proceed. Network spy runs in SDK child.
- IPC protocol documented in the plan (fd 3 telemetry, fd 4 control in SDK mode).

## Implementation Strategy
- Keep Phase 1/2 fetch monkey‑patch for WORKING/IDLE (no semantic changes)
- Use SDK `canCallTool` for PENDING (fires before network), not API/SSE parsing
- Communicate over dedicated pipes:
  - fd 3 (child→parent): telemetry/events including permission requests
  - fd 4 (parent→child): control channel for allow/deny decisions
- Emit rich tool details (tool name + parameters) to power Tallr UI

Scope note: For Phase 3, the primary goal is detection. The full end‑to‑end approval flow (React UI → Tauri → CLI) is tracked as a separate phase. The CLI supports optional developer approvals via `/allow` and `/deny` for local testing; production UI wiring is deferred.

## Architecture

```
User prompt
   ↓
Claude decides to use a tool
   ↓                                     ↓
Launcher SDK canCallTool(tool, args)     (No network yet)
   ↓
fd3: { type: 'permission-request', id, tool, args }
   ↓
Parent shows UI → user Approve/Deny
   ↓
fd4: { type: 'permission-response', id, decision }
   ↓
canCallTool resolves → SDK proceeds or cancels
   ↓
If allowed: network fetches → fd3 fetch-start/end → WORKING/IDLE
```

Key insight: PENDING is best detected at SDK callback time; WORKING/IDLE remain network‑driven.

## Files To Modify

1) tools/lib/claude-launcher.cjs
- Use SDK programmatically for interactive sessions
- Implement `canCallTool` handler that:
  - emits `permission-request` on fd 3 with tool details
  - waits for a matching `permission-response` from fd 4
  - resolves with `{ behavior: 'allow' }` or `{ behavior: 'deny' }`
- Maintain existing fetch wrapper to continue emitting `fetch-start`/`fetch-end`

2) tools/lib/network-launcher.js
- Spawn the launcher with an extra pipe for fd 4: `stdio: ['inherit','inherit','inherit','pipe','pipe']`
- Continue parsing fd 3 (telemetry)
- On `permission-request`, set state to PENDING and surface tool details to UI
- When user acts, write a `permission-response` to the child’s fd 4

3) Optional (UI wiring)
- Use existing `StateTracker` to set PENDING and update details payload with tool info

## Event Schemas

Child → Parent (fd 3, NDJSON):
- permission-request: { type: 'permission-request', id, tool: { name, args }, timestamp }
- permission-update: { type: 'permission-update', id, status: 'approved'|'denied'|'timeout' }
- fetch-start: { type: 'fetch-start', id, hostname, path, method, timestamp }
- fetch-end:   { type: 'fetch-end', id, timestamp, error? }

Parent → Child (fd 4, NDJSON):
- permission-response: { type: 'permission-response', id, decision: 'allow'|'deny' }

See also: IPC Protocol (fd 3 / fd 4) section in NETWORK_INTERCEPTION_PLAN.md for full IPC details, spawn configuration, examples, and debugging tips.

## Launcher Pseudocode (claude-launcher.cjs)

```javascript
const fs = require('fs');
const pending = new Map();
let nextId = 0;

function write3(obj) { try { fs.writeSync(3, JSON.stringify(obj) + '\n'); } catch {} }

// Read control messages from fd 4
const ctrl = fs.createReadStream(null, { fd: 4 });
let buf = '';
ctrl.on('data', chunk => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx+1);
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'permission-response') {
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg.decision === 'allow' ? { behavior: 'allow' }
                                           : { behavior: 'deny', message: 'Denied by user' });
        }
      }
    } catch {}
  }
});

async function canCallTool(toolName, input) {
  const id = ++nextId;
  write3({ type: 'permission-request', id, tool: { name: toolName, args: input }, timestamp: Date.now() });
  return new Promise(resolve => pending.set(id, resolve));
}

// Keep Phase 1/2 fetch monkey-patch for WORKING/IDLE
// ... existing fetch wrapper emitting fetch-start/fetch-end ...

// Start SDK query
const { query } = await import('@anthropic-ai/claude-code');
const q = query({ prompt, options: { canCallTool, cwd: process.cwd() } });
for await (const message of q) {
  // mirror assistant output to stdout
}
```

## Parent Pseudocode (network-launcher.js)

```javascript
const child = spawn('node', [launcherPath, ...args], {
  stdio: ['inherit','inherit','inherit','pipe','pipe'] // fd3 telemetry, fd4 control
});

// Telemetry (fd 3)
const rl = createInterface({ input: child.stdio[3] });
rl.on('line', line => {
  const msg = JSON.parse(line);
  switch (msg.type) {
    case 'permission-request':
      stateTracker.changeState('PENDING', `Claude requests ${msg.tool.name}`, 'high', 'network');
      // Surface tool details to UI (client.updateTaskDetails or a dedicated channel)
      // Store msg.id in a map to match user action later
      break;
    case 'fetch-start':
      stateTracker.changeState('WORKING', 'Claude is thinking...', 'high', 'network');
      break;
    case 'fetch-end':
      // debounce to IDLE when no active fetches remain (existing logic)
      break;
  }
});

// Control (fd 4)
function sendDecision(id, decision) {
  const payload = JSON.stringify({ type: 'permission-response', id, decision }) + '\n';
  child.stdio[4].write(payload);
}
```

## State Management
- PENDING: set on `permission-request` immediately
- WORKING: driven by `fetch-start` (after allow)
- IDLE: driven by `fetch-end` + existing 500ms debounce
- Denied: remain or transition to IDLE based on subsequent activity; emit `permission-update` optionally

## Tool Details in UI
- Use `stateTracker.changeState('PENDING', details, 'high', 'network')` where details concisely describe the request, e.g.:
  - "Claude requests write_file { path: 'test.txt' }"
- Additionally push a structured payload via `client.updateTaskDetails(taskId, JSON.stringify({ type: 'tool-request', id, tool }))` for richer rendering in the React app.

## Quick Manual Tests

Baseline (Phase 1/2, default)
- `./tools/tallr claude --print "hello"` → Claude replies as normal
- `DEBUG=tallr:network ./tools/tallr claude --print "hello"` → fetch-start/fetch-end logs

Phase 3a (SDK, opt-in)
- One-time: `chmod +x tools/lib/claude-remote-launcher.cjs`
- `TALLR_SDK_MODE=true ./tools/tallr claude --print "hello"` → WORKING/IDLE via network
- `TALLR_SDK_MODE=true DEBUG=tallr:state,tallr:network ./tools/tallr claude --print` then type a tool prompt; expect early `permission-prompt` (PENDING), then `permission-request` on tool attempt

## Tests (Vitest)

Update or add tests to validate:
- Launcher emits `permission-request` on canCallTool
- Parent handles `permission-request` and sets PENDING
- Control path: writing `permission-response` to fd 4 unblocks canCallTool
- No regression in Phase 1/2: `fetch-start`/`fetch-end` still flow

Suggested test files:
- tools/test/claude-launcher-phase3-pending.test.js
  - Adapt expectations from SSE parsing to canCallTool + fd4 control
  - Keep network events assertions

## Success Criteria
1) PENDING appears when canCallTool fires (before network)
2) WORKING/IDLE unchanged and still network‑driven
3) Tool details (name + args) rendered in Tallr UI
4) Approve/Deny round‑trip works via fd 4
5) Fallback: if SDK path fails, launcher falls back to CLI and pattern detection continues to work

## Migration Notes
- Remove any plans to parse API response bodies or SSE chunks for PENDING; this is fragile and unnecessary
- Keep fetch wrapper lightweight; do not clone/read bodies to avoid performance and correctness risks

## Common Issues & Fixes
- No fd 4 available: ensure `stdio` includes a 5th pipe when spawning
- Hanging on canCallTool: verify parent writes a newline‑terminated JSON decision to fd 4
- Tool args too large: truncate in UI details but keep full payload in debug logs

## Attribution
- Based on @happy-coder’s launcher + fd 3 design and SDK callback permission flow (MIT)

## Status
Phase 3 design finalized. Implementation focuses on SDK callback + fd3/fd4 wiring with minimal touches to existing Phase 1/2 code.
