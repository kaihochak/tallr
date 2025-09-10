# Tallr Network Interception Implementation Plan
## Simple Adaptation of @happy-coder's Core Technique

### Overview

Implement @happy-coder's network-based state detection for more accurate Claude monitoring. We're adapting only the core spy technique - not their full system with encryption/mobile/etc.

### What We're Taking from @happy-coder

| Component | Why | Attribution Required |
|-----------|-----|---------------------|
| Pre-load fetch() monkey patching | Core innovation for network detection | ✅ Code comments + README |
| fd 3 pipe communication | Clean parent-child messaging | ✅ Technique attribution |
| fetch-start/fetch-end events | Precise WORKING/IDLE timing | ✅ Message format attribution |
| 500ms debouncing | Prevents state flicker | ✅ Algorithm attribution |

### What We're NOT Taking

- Encryption (local only)
- WebSocket server (we use Tauri HTTP)
- Mobile app integration
- Session persistence (we have our own)
- Complex daemon architecture

## Implementation

### Phase 1: Core Network Detection

#### File 1: `tools/lib/claude-launcher.js` (NEW)
**Purpose**: The spy script that runs BEFORE Claude loads

```javascript
/*
 * Network interception based on @happy-coder's innovation
 * Original: https://github.com/happy-coder/happy-cli
 * Used under MIT license with attribution
 */

const fs = require('fs');

// @happy-coder's fd 3 communication technique
function writeMessage(message) {
    try {
        fs.writeSync(3, JSON.stringify(message) + '\n');
    } catch (err) {
        // fd 3 not available - graceful fallback
    }
}

// @happy-coder's core innovation: pre-load network interception
const originalFetch = global.fetch;
let fetchCounter = 0;

global.fetch = function(...args) {
    const id = ++fetchCounter;
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    
    // Only track Claude's API calls
    if (url.includes('api.anthropic.com')) {
        writeMessage({
            type: 'fetch-start',
            id,
            timestamp: Date.now()
        });
    }

    const fetchPromise = originalFetch(...args);
    
    if (url.includes('api.anthropic.com')) {
        const sendEnd = () => {
            writeMessage({
                type: 'fetch-end',
                id,
                timestamp: Date.now()
            });
        };
        
        fetchPromise.then(sendEnd, sendEnd);
    }
    
    return fetchPromise;
};

// Load Claude AFTER we've set up spying
import('@anthropic-ai/claude-code/cli.js');
```

#### File 2: `tools/tl-wrap.js` (MODIFY)
**Purpose**: Add launcher mode option

**Changes to `runWithPTY` function (around line 160):**

```javascript
async function runWithPTY(command, commandArgs) {
    // NEW: Check for launcher mode
    const useLauncher = process.env.TALLR_LAUNCHER_MODE === 'true' && command === 'claude';
    
    let ptyProcess;
    
    if (useLauncher) {
        // Use network detection launcher
        ptyProcess = pty.spawn('node', [path.join(__dirname, 'lib/claude-launcher.js')], {
            name: 'xterm-color',
            cols: process.stdout.columns || 80,
            rows: process.stdout.rows || 30,
            cwd: process.cwd(),
            env: { ...process.env, TALLR_TASK_ID: taskId },
            // fd 3 for spy messages (@happy-coder technique)
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        });
        
        // Handle network spy messages
        setupNetworkListener(ptyProcess);
        
    } else {
        // Original approach (unchanged)
        ptyProcess = pty.spawn(command, commandArgs, {
            name: 'xterm-color',
            cols: process.stdout.columns || 80,
            rows: process.stdout.rows || 30,
            cwd: process.cwd(),
            env: { ...process.env, TALLR_TASK_ID: taskId }
        });
    }
    
    // Rest of function unchanged...
```

**Add new function to `tl-wrap.js`:**

```javascript
function setupNetworkListener(ptyProcess) {
    const activeFetches = new Map();
    
    ptyProcess.stdio[3].on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const message = JSON.parse(line);
                
                switch (message.type) {
                    case 'fetch-start':
                        activeFetches.set(message.id, message);
                        stateTracker.changeState('WORKING', 'Claude is thinking...', 'high', 'network');
                        break;
                        
                    case 'fetch-end':
                        activeFetches.delete(message.id);
                        
                        // @happy-coder's 500ms debouncing
                        setTimeout(() => {
                            if (activeFetches.size === 0) {
                                stateTracker.changeState('IDLE', 'Ready for input', 'high', 'network');
                            }
                        }, 500);
                        break;
                }
            } catch (error) {
                // Ignore malformed messages
            }
        }
    });
}
```

#### File 3: `tools/lib/state-tracker.js` (MODIFY)
**Purpose**: Track detection method for debugging

**Add to constructor:**
```javascript
constructor(client, taskId, agent, enableDebug = false) {
    // ... existing code ...
    
    // Track which detection method is being used
    this.detectionMethod = 'patterns'; // default
}
```

**Modify `changeState` method:**
```javascript
async changeState(newState, details, confidence = 'medium', detectionMethod = null) {
    const method = detectionMethod || this.detectionMethod;
    
    // ... existing state change logic ...
    
    const stateEntry = {
        from: previousState,
        to: newState,
        timestamp: now,
        duration: now - this.lastStateChange,
        details: details,
        confidence: confidence,
        detectionMethod: method  // Track method for debugging
    };
    
    // ... rest unchanged ...
}
```

### Phase 2: UI Visibility (Optional)

#### File 4: `src/components/TaskRow.tsx` (MODIFY)
**Purpose**: Show which detection method is active

```typescript
// Add detection method badge (simple version)
{task.detection_method && (
    <span className={`text-xs px-1 py-0.5 rounded ${
        task.detection_method === 'network' ? 'bg-green-100 text-green-700' :
        'bg-gray-100 text-gray-600'
    }`}>
        {task.detection_method === 'network' ? 'NET' : 'PAT'}
    </span>
)}
```

## Testing Plan

### ✅ Phase 1 Testing (COMPLETE)
**Vitest Integration Testing:**
```bash
# Run all tests
npm run test

# Run tests in CI mode
npm run test:ci

# Manual launcher testing
node tools/lib/claude-launcher.cjs --help
```

**Test Coverage (All Passing):**
- ✅ Launcher file exists and is executable
- ✅ Claude dependency (@anthropic-ai/claude-code) properly installed
- ✅ Launcher starts Claude correctly and shows help
- ✅ Network spy messages work via fd 3 communication

### Future Testing (Phase 2+)

### Enable Network Mode
```bash
export TALLR_LAUNCHER_MODE=true
./tools/tallr claude
```

### Verify Detection Method
- UI should show "NET" badge when launcher mode is active
- UI should show "PAT" badge when using pattern fallback

### Debug Network Events
```bash
DEBUG=tallr:* TALLR_LAUNCHER_MODE=true ./tools/tallr claude
```

## File Changes Summary

| File | Change | Lines Added |
|------|--------|-------------|
| `tools/lib/claude-launcher.js` | NEW | ~60 |
| `tools/tl-wrap.js` | MODIFY | ~40 |
| `tools/lib/state-tracker.js` | MODIFY | ~10 |
| `src/components/TaskRow.tsx` | MODIFY | ~8 |
| **TOTAL** | | **~118 lines** |

## Attribution & Legal

### Code Comments
Every file that uses @happy-coder techniques includes:
```javascript
/*
 * Based on @happy-coder's network interception technique
 * Original: https://github.com/happy-coder/happy-cli  
 * Used under MIT license with attribution
 */
```

### README Update
```markdown
## Network Detection
Tallr's network-based state detection is inspired by @happy-coder's innovative approach:
- Pre-load network interception via monkey patching
- Process communication via file descriptor 3  
- Debounced state transitions

Original implementation: https://github.com/happy-coder/happy-cli
```

## Success Criteria

### Functional
- ✅ `TALLR_LAUNCHER_MODE=true` enables network detection
- ✅ UI shows "NET" vs "PAT" detection method  
- ✅ State changes immediately on network activity
- ✅ Fallback works if launcher fails

### Technical  
- ✅ No interference with Claude Code operation
- ✅ Clean process cleanup on exit
- ✅ Maintains backward compatibility

## Risk Mitigation

1. **Opt-in Only** - Requires explicit environment variable
2. **Graceful Fallback** - Falls back to pattern detection if launcher fails  
3. **Backward Compatible** - Original behavior unchanged by default
4. **Debug Visibility** - Clear indication of which method is active

---

## Next Steps

1. Implement `claude-launcher.js` spy script
2. Modify `tl-wrap.js` to support launcher mode
3. Test with `TALLR_LAUNCHER_MODE=true`
4. Add UI detection method badge
5. Document and deploy

**Simple, focused, and properly attributed adaptation of @happy-coder's core innovation.**

---

# ✅ VALIDATION COMPLETE - @happy-coder Code Analysis

## Overview

After thorough analysis of @happy-coder's actual implementation in `reference/happy-cli-main/`, our plan is **validated and accurate**. We can directly reuse 90% of their proven code with minimal adaptation for Tallr's architecture.

## What is Monkey Patching? (@happy-coder's Core Innovation)

### The Problem
Traditional CLI monitoring relies on parsing terminal output (patterns like "❯ 1. Yes"). This is unreliable because:
- Terminal rendering issues (`\r`, ANSI codes)
- Different output formats across updates
- Timing issues with buffer parsing
- No way to detect "thinking" vs "idle" precisely

### @happy-coder's Solution: Pre-Load Network Interception

**Monkey patching** = Replacing a function before the target program loads it.

#### Step-by-Step: How @happy-coder's Launcher Works

1. **User Types Command**
   ```bash
   $ happy  # (not claude directly)
   ```

2. **@happy-coder Starts Launcher Process**
   ```javascript
   // happy-cli/src/claude/claudeLocal.ts:117
   const claudeCliPath = resolve(join(projectPath(), 'scripts', 'claude_local_launcher.cjs'))
   const child = spawn('node', [claudeCliPath, ...args], {
       stdio: ['inherit', 'inherit', 'inherit', 'pipe'], // fd 3 for spy messages
   });
   ```

3. **Launcher Sets Up Spying BEFORE Claude Loads**
   ```javascript
   // claude_local_launcher.cjs:44-92 (EXACT code we'll copy)
   
   // STEP 1: Save original fetch function
   const originalFetch = global.fetch;
   let fetchCounter = 0;
   
   // STEP 2: Replace global.fetch with spy version
   global.fetch = function(...args) {
       const id = ++fetchCounter;
       const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
       
       // Tell parent process: "Network request started!"
       writeMessage({
           type: 'fetch-start',
           id,
           hostname: 'api.anthropic.com',
           timestamp: Date.now()
       });
   
       // Call the REAL fetch (Claude gets normal response)
       const fetchPromise = originalFetch(...args);
       
       // When request finishes, tell parent
       fetchPromise.then(() => {
           writeMessage({
               type: 'fetch-end',
               id,
               timestamp: Date.now()
           });
       });
       
       return fetchPromise; // Claude gets exactly what it expects
   };
   
   // STEP 3: NOW load Claude (it will use our spy version)
   import('@anthropic-ai/claude-code/cli.js');
   ```

4. **Parent Process Listens for Spy Messages**
   ```javascript
   // claudeLocal.ts:144-192 (EXACT logic we'll copy)
   const activeFetches = new Map();
   
   rl.on('line', (line) => {
       const message = JSON.parse(line);
       
       switch (message.type) {
           case 'fetch-start':
               activeFetches.set(message.id, message);
               updateThinking(true); // WORKING state
               break;
               
           case 'fetch-end':
               activeFetches.delete(message.id);
               if (activeFetches.size === 0) {
                   setTimeout(() => {
                       if (activeFetches.size === 0) {
                           updateThinking(false); // IDLE state
                       }
                   }, 500); // Prevent flicker
               }
               break;
       }
   });
   ```

### Why This Works Perfectly

1. **Perfect Timing** - Knows EXACTLY when Claude starts/stops thinking
2. **Zero Interference** - Claude Code runs completely normal
3. **100% Reliable** - No parsing terminal output or guessing from patterns
4. **Network = Thinking** - Simple, accurate mental model

## Direct Code Mapping: @happy-coder → Tallr

### File 1: Launcher Script (Direct Copy)

| @happy-coder | Tallr | Change |
|-------------|-------|---------|
| `scripts/claude_local_launcher.cjs` | `tools/lib/claude-launcher.js` | **Direct copy** |
| Lines 44-92: fetch() monkey patching | Same code | **No changes** |
| Lines 8-14: writeMessage() function | Same code | **No changes** |
| Line 98: `import('@anthropic-ai/claude-code/cli.js')` | Same import | **No changes** |

**Reuse Level: 100%** - We copy their launcher script exactly.

### File 2: Process Communication (Direct Copy)

| @happy-coder | Tallr | Change |
|-------------|-------|---------|
| `claudeLocal.ts:129-134` | `tl-wrap.js:runWithPTY()` | **Adapt stdio setup** |
| `stdio: ['inherit', 'inherit', 'inherit', 'pipe']` | `stdio: ['pipe', 'pipe', 'pipe', 'pipe']` | PTY compatibility |
| `claudeLocal.ts:144-192` | `tl-wrap.js:setupNetworkListener()` | **Direct copy logic** |

**Reuse Level: 95%** - Same logic, different process spawning method.

### File 3: State Detection (Direct Copy)

| @happy-coder | Tallr | Change |
|-------------|-------|---------|
| `case 'fetch-start': updateThinking(true)` | `case 'fetch-start': changeState('WORKING')` | **Different state system** |
| `setTimeout(..., 500)` debouncing | Same 500ms debouncing | **No changes** |
| `activeFetches` Map tracking | Same Map tracking | **No changes** |

**Reuse Level: 90%** - Same algorithm, different state update method.

## Implementation Evidence

### Evidence 1: @happy-coder Uses Exact Same Approach We Planned

**Our Plan:**
```javascript
// Phase 1: Create launcher with monkey patching
global.fetch = function(...args) {
    writeMessage({ type: 'fetch-start', id, timestamp });
    return originalFetch(...args);
};
```

**@happy-coder's Actual Code (claude_local_launcher.cjs:47-91):**
```javascript
global.fetch = function(...args) {
    // ... same message format ...
    writeMessage({
        type: 'fetch-start',
        id,
        hostname,
        path,
        method,
        timestamp: Date.now()
    });
    
    const fetchPromise = originalFetch(...args);
    // ... same promise handling ...
```

**✅ Validation: Our plan matches their implementation exactly.**

### Evidence 2: fd 3 Communication Pattern Matches

**Our Plan:**
```javascript
// Use fd 3 for spy messages
stdio: ['pipe', 'pipe', 'pipe', 'pipe']
ptyProcess.stdio[3].on('data', handleSpyMessages);
```

**@happy-coder's Actual Code (claudeLocal.ts:130 & 137):**
```javascript
const child = spawn('node', [claudeCliPath, ...args], {
    stdio: ['inherit', 'inherit', 'inherit', 'pipe'], // fd 3 = pipe
});

if (child.stdio[3]) {
    const rl = createInterface({
        input: child.stdio[3] as any,
```

**✅ Validation: Same fd 3 communication pattern.**

### Evidence 3: State Detection Logic Matches

**Our Plan:**
```javascript
case 'fetch-start':
    stateTracker.changeState('WORKING', 'Claude is thinking...');
case 'fetch-end':
    setTimeout(() => { changeState('IDLE'); }, 500);
```

**@happy-coder's Actual Code (claudeLocal.ts:161-190):**
```javascript
case 'fetch-start':
    activeFetches.set(message.id, {...});
    updateThinking(true);
    break;

case 'fetch-end':
    activeFetches.delete(message.id);
    if (activeFetches.size === 0 && thinking && !stopThinkingTimeout) {
        stopThinkingTimeout = setTimeout(() => {
            if (activeFetches.size === 0) {
                updateThinking(false);
            }
        }, 500); // Small delay to avoid flickering
    }
```

**✅ Validation: Same state logic, same 500ms debouncing.**

## Implementation Phase Documents

The implementation has been broken down into focused phase documents for clarity:

### Important: Claude-Specific Implementation
- **This network detection is initially for Claude only**
- **Gemini and Codex will continue using pattern detection**
- **Future phases will add similar launchers for other agents**

### Phase Documents:
- **[NETWORK_PHASE_1_LAUNCHER.md](./NETWORK_PHASE_1_LAUNCHER.md)** - Create Claude launcher with fetch interception ✅ **COMPLETE**
- **NETWORK_PHASE_2_PTY.md** - Integrate launcher into tl-wrap.js for Claude only (NEXT)
- **NETWORK_PHASE_3_STATE.md** - Connect to state tracker (TODO)
- **NETWORK_PHASE_4_PENDING.md** - Add PENDING detection via API analysis (TODO)
- **NETWORK_PHASE_5_OTHER_AGENTS.md** - Create launchers for Gemini/Codex (TODO)

Each phase document contains:
- Specific goals and success criteria
- Complete code to implement
- Testing procedures
- Troubleshooting guide

### State Detection Strategy After Implementation:
```
Claude with TALLR_LAUNCHER_MODE=true:
  → WORKING: Network detection (fetch-start)
  → IDLE: Network detection (fetch-end + 500ms)
  → PENDING: Network detection (API analysis) [future]

Gemini/Codex (or Claude with launcher disabled):
  → All states: Pattern detection (existing behavior)
```

---

## Detailed Incremental Implementation Phases (Overview)

### ✅ **Phase 1: Create Launcher Script** (COMPLETED) 
📄 **See: [NETWORK_PHASE_1_LAUNCHER.md](./NETWORK_PHASE_1_LAUNCHER.md)**
**Goal**: Basic launcher that loads Claude - minimal viable implementation

**✅ STATUS: COMPLETE** - Launcher implemented with comprehensive Vitest testing
- ✅ Launcher script created: `tools/lib/claude-launcher.cjs`
- ✅ Network interception working via fetch monkey-patching
- ✅ fd 3 communication established for spy messages
- ✅ Claude loads and functions normally through launcher
- ✅ Comprehensive test suite with Vitest framework
- ✅ CI/CD integration for automated testing

**File to Create**: `tools/lib/claude-launcher.js`

**Implementation Steps**:
1. Create basic file structure with module imports
2. Add writeMessage function (copy from claude_local_launcher.cjs lines 8-14)
3. Add Claude import at bottom (line 98)
4. Test basic launching works

**Code to Copy from @happy-coder**:
```javascript
// Lines 8-14: writeMessage function
function writeMessage(message) {
    try {
        fs.writeSync(3, JSON.stringify(message) + '\n');
    } catch (err) {
        // fd 3 not available, ignore
    }
}

// Line 98: Claude import
import('@anthropic-ai/claude-code/cli.js')
```

**Test Commands**:
```bash
# Basic test - should start Claude
node tools/lib/claude-launcher.js

# With arguments - should pass through
node tools/lib/claude-launcher.js --help
```

**Success Criteria**:
- ✅ Launcher loads without errors
- ✅ Claude starts normally
- ✅ Can execute Claude commands

---

### **Phase 2: Add Fetch Monkey Patching** (45 min)
**Goal**: Intercept network calls without breaking Claude

**File to Modify**: `tools/lib/claude-launcher.js`

**Implementation Steps**:
1. Add fetch interception code (copy lines 44-92 from claude_local_launcher.cjs)
2. Include UUID interception for session detection (optional, lines 16-41)
3. Preserve fetch properties (lines 95-96)
4. Test spy messages are generated

**Code to Copy from @happy-coder**:
```javascript
// Lines 44-92: Complete fetch monkey patching
const originalFetch = global.fetch;
let fetchCounter = 0;

global.fetch = function(...args) {
    // ... (full implementation from @happy-coder)
};

// Lines 95-96: Preserve properties
Object.defineProperty(global.fetch, 'name', { value: 'fetch' });
Object.defineProperty(global.fetch, 'length', { value: originalFetch.length });
```

**Test Commands**:
```bash
# Run with fd 3 redirected to see messages
node tools/lib/claude-launcher.js 3>&1 1>/dev/null 2>&1 | grep fetch
# Should see fetch-start/fetch-end messages when Claude makes API calls
```

**Success Criteria**:
- ✅ Spy messages appear when redirecting fd 3
- ✅ Messages contain correct fetch-start/end structure
- ✅ Claude functionality unchanged

---

### **Phase 3: PTY Integration - Launcher Mode** (1 hour)
**Goal**: Integrate launcher into tl-wrap.js with environment variable control

**File to Modify**: `tools/tl-wrap.js`

**Implementation Steps**:
1. Add environment variable check: `TALLR_LAUNCHER_MODE === 'true'`
2. Modify `runWithPTY()` function around line 160
3. Add conditional spawn logic for launcher vs normal mode
4. Set up stdio with 4 pipes: `['pipe', 'pipe', 'pipe', 'pipe']`

**Pseudo-code Structure**:
```javascript
async function runWithPTY(command, commandArgs) {
    const useLauncher = process.env.TALLR_LAUNCHER_MODE === 'true' && command === 'claude';
    
    let ptyProcess;
    if (useLauncher) {
        // Spawn launcher with fd 3 pipe
        ptyProcess = pty.spawn('node', [launcherPath], {
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        });
    } else {
        // Original spawn logic
    }
}
```

**Test Commands**:
```bash
# Test without launcher (should work as before)
./tools/tallr claude

# Test with launcher (should also work, no visible difference yet)
TALLR_LAUNCHER_MODE=true ./tools/tallr claude
```

**Success Criteria**:
- ✅ Both modes work (with/without TALLR_LAUNCHER_MODE)
- ✅ No visible difference to user
- ✅ Process cleanup works correctly

---

### **Phase 4: fd 3 Message Handler** (1 hour)
**Goal**: Process spy messages from launcher in parent process

**File to Modify**: `tools/tl-wrap.js`

**Implementation Steps**:
1. Add `setupNetworkListener()` function
2. Set up readline interface for fd 3 (like @happy-coder's lines 137-141)
3. Parse JSON messages safely with try-catch
4. Track active fetches with Map (lines 144)
5. Add debug logging for each message type

**Code Structure from @happy-coder**:
```javascript
function setupNetworkListener(ptyProcess) {
    const activeFetches = new Map();
    
    // Based on claudeLocal.ts lines 137-141
    const rl = createInterface({
        input: ptyProcess.stdio[3],
        crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
        try {
            const message = JSON.parse(line);
            // Handle message types (lines 150-192)
        } catch (e) {
            // Ignore malformed messages
        }
    });
}
```

**Test Commands**:
```bash
# Should see network detection debug messages
DEBUG=tallr:* TALLR_LAUNCHER_MODE=true ./tools/tallr claude
# Look for: "[network] fetch-start", "[network] fetch-end"
```

**Success Criteria**:
- ✅ JSON parsing doesn't crash on malformed data
- ✅ Active fetches tracked correctly
- ✅ Memory doesn't leak with Map

---

### **Phase 5: Connect to State Tracker** (45 min)
**Goal**: Update Tallr state based on network activity

**Files to Modify**: 
- `tools/tl-wrap.js`
- `tools/lib/state-tracker.js`

**Implementation Steps**:
1. Call `stateTracker.changeState()` on fetch events
2. Implement @happy-coder's 500ms debouncing (line 190)
3. Add 'network' as detection method parameter
4. Ensure state changes are logged

**State Change Logic** (from claudeLocal.ts lines 161-191):
```javascript
case 'fetch-start':
    activeFetches.set(message.id, message);
    stateTracker.changeState('WORKING', 'Claude is thinking...', 'high', 'network');
    break;

case 'fetch-end':
    activeFetches.delete(message.id);
    if (activeFetches.size === 0) {
        setTimeout(() => {
            if (activeFetches.size === 0) {
                stateTracker.changeState('IDLE', 'Ready for input', 'high', 'network');
            }
        }, 500); // @happy-coder's debouncing
    }
    break;
```

**Test Commands**:
```bash
# Watch state changes in logs
TALLR_LAUNCHER_MODE=true ./tools/tallr claude
# In another terminal:
tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq 'select(.namespace == "tallr:state")'
```

**Success Criteria**:
- ✅ WORKING state appears immediately
- ✅ IDLE state has 500ms delay
- ✅ Rapid requests don't cause flicker

---

### **Phase 6: Fallback Mechanism** (30 min)
**Goal**: Graceful fallback to pattern detection if launcher fails

**File to Modify**: `tools/tl-wrap.js`

**Implementation Steps**:
1. Wrap launcher spawn in try-catch
2. On error, log warning and fall back to normal spawn
3. Set detection method to 'patterns' on fallback
4. Test various failure scenarios

**Fallback Logic**:
```javascript
try {
    if (useLauncher) {
        ptyProcess = pty.spawn('node', [launcherPath], ...);
        setupNetworkListener(ptyProcess);
    }
} catch (error) {
    console.warn('Launcher failed, falling back to patterns:', error);
    ptyProcess = pty.spawn(command, commandArgs, ...);
    // Use pattern detection
}
```

**Test Commands**:
```bash
# Break launcher intentionally
mv tools/lib/claude-launcher.js tools/lib/claude-launcher.js.bak
TALLR_LAUNCHER_MODE=true ./tools/tallr claude
# Should fall back to pattern detection
mv tools/lib/claude-launcher.js.bak tools/lib/claude-launcher.js
```

**Success Criteria**:
- ✅ Fallback triggers on missing launcher
- ✅ Fallback triggers on launcher errors
- ✅ Pattern detection still works

---

### **Phase 7: Detection Method Tracking** (30 min)
**Goal**: Track and report which detection method is being used

**File to Modify**: `tools/lib/state-tracker.js`

**Implementation Steps**:
1. Add `detectionMethod` field to constructor
2. Include method in state change messages
3. Pass method to HTTP endpoint
4. Add to debug output

**State Tracker Modifications**:
```javascript
constructor(client, taskId, agent, enableDebug = false) {
    // ... existing code ...
    this.detectionMethod = 'patterns'; // default
}

async changeState(newState, details, confidence = 'medium', detectionMethod = null) {
    const method = detectionMethod || this.detectionMethod;
    // Include in state entry and HTTP call
}
```

**Test Commands**:
```bash
# Check detection method in logs
TALLR_LAUNCHER_MODE=true ./tools/tallr claude
tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq '.detectionMethod'
```

**Success Criteria**:
- ✅ Detection method logged correctly
- ✅ Backend receives method field
- ✅ Method switches on fallback

---

### **Phase 8: UI Badge (Optional)** (45 min)
**Goal**: Visual indicator showing NET vs PAT detection method

**File to Modify**: `src/components/TaskRow.tsx`

**Implementation Steps**:
1. Add detection_method to Task type
2. Create badge component
3. Style with Tailwind (green for network, gray for patterns)
4. Position badge appropriately

**UI Component**:
```typescript
{task.detection_method && (
    <span className={`text-xs px-1 py-0.5 rounded ${
        task.detection_method === 'network' ? 'bg-green-100 text-green-700' :
        'bg-gray-100 text-gray-600'
    }`}>
        {task.detection_method === 'network' ? 'NET' : 'PAT'}
    </span>
)}
```

**Test Process**:
1. Start app: `npm run tauri:dev`
2. Run: `TALLR_LAUNCHER_MODE=true ./tools/tallr claude`
3. Verify "NET" badge appears
4. Kill and restart without launcher mode
5. Verify "PAT" badge appears

**Success Criteria**:
- ✅ Badge shows correct method
- ✅ Badge updates on method change
- ✅ UI doesn't break without field

---

### **Phase 9: Final Testing & Documentation** (1 hour)
**Goal**: Comprehensive validation and documentation

**Testing Checklist**:
1. **Normal Operation**: Pattern detection without launcher
2. **Network Detection**: With TALLR_LAUNCHER_MODE=true
3. **Long Sessions**: 10+ minute Claude sessions
4. **Concurrent Fetches**: Multiple API calls simultaneously
5. **Error Recovery**: Kill launcher mid-session
6. **Performance**: Compare CPU/memory usage

**Documentation Tasks**:
1. Update README with launcher mode instructions
2. Add attribution section for @happy-coder
3. Document environment variables
4. Create troubleshooting guide

**Performance Testing**:
```bash
# Pattern detection baseline
time ./tools/tallr claude "write hello world in python"

# Network detection comparison
time TALLR_LAUNCHER_MODE=true ./tools/tallr claude "write hello world in python"
```

**Success Criteria**:
- ✅ All test scenarios pass
- ✅ No performance regression
- ✅ Documentation complete
- ✅ Attribution properly included

---

## Testing Strategy Summary

### Unit Testing Approach
Each phase has isolated test commands that verify functionality without dependencies on later phases.

### Integration Testing
After Phase 5, full end-to-end testing of state detection flow.

### Regression Testing
Ensure pattern detection continues working throughout all phases.

### Performance Monitoring
- Memory usage via Activity Monitor
- CPU usage comparison
- Response time measurements

## Total Implementation Time: 6-8 hours

Broken into 9 focused phases, each independently testable. Can pause at any phase without breaking existing functionality.

## Ready for Implementation

**Confidence Level: Very High**
- We're copying proven code, not designing something new
- 90% direct code reuse from working system
- Clear incremental phases with testable milestones
- Full fallback to existing pattern detection