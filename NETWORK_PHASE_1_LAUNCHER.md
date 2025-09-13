# ✅ Network Detection - Phase 1: Launcher Implementation (COMPLETE)

## Goal
Create a launcher script that intercepts Claude's network calls to detect WORKING/IDLE states accurately.

## ✅ IMPLEMENTATION STATUS: COMPLETE
**All success criteria met with comprehensive testing framework integration**

**IMPORTANT**: This launcher is Claude-specific. Other agents (Gemini, Codex) will continue using pattern detection until we create similar launchers for them.

## Important Clarification: State Detection Coverage

### What This Phase Provides:
- **WORKING state**: Detected instantly when Claude makes API calls
- **IDLE state**: Detected when API calls complete (with 500ms debounce)

### PENDING State Detection:
- **Current Phase 1**: Won't detect PENDING yet (launcher only does WORKING/IDLE)
- **Future Phases**: Will add PENDING detection by analyzing API request/response content
- **Fallback**: Pattern detection remains available if network detection fails

## What We're Building
A Node.js script that:
1. Monkey-patches the global `fetch` function
2. Sends spy messages via file descriptor 3
3. Loads Claude with the patched fetch in place

## Architecture

```
Current Flow (Pattern Detection - Still used for Gemini/Codex):
./tools/tallr gemini → tl-wrap.js → spawn('gemini') → Parse terminal output → Pattern detection

New Flow for Claude Only (Network Detection):
./tools/tallr claude → tl-wrap.js → if (command === 'claude' && TALLR_LAUNCHER_MODE)
                                            ↓
                                    spawn('node', ['claude-launcher.js'])
                                            ↓
                                    Launcher patches fetch()
                                            ↓
                                    Launcher loads Claude
                                            ↓
                            Claude makes API call with OUR fetch
                                            ↓
                    Send 'fetch-start' via fd 3 → WORKING state
                    Send 'fetch-end' via fd 3 → IDLE state

Fallback (if launcher disabled or fails):
./tools/tallr claude → tl-wrap.js → spawn('claude') → Pattern detection (existing behavior)
```

## Files to Create/Modify

### 1. Create: `tools/lib/claude-launcher.js`

**Source**: Copy from `reference/happy-cli-main/scripts/claude_local_launcher.cjs`

**What to copy**:
- Lines 1-14: Basic setup and writeMessage function
- Lines 44-92: Fetch interception logic
- Lines 95-96: Preserve fetch properties
- Line 98: Import Claude

**What to skip**:
- Lines 16-41: UUID interception (we don't need session tracking)
- Line 5: Autoupdater disable (optional)

### Complete Code for `tools/lib/claude-launcher.js`:

```javascript
/*
 * Network interception based on @happy-coder's innovation
 * Original: https://github.com/happy-coder/happy-cli
 * Used under MIT license with attribution
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
```

## How It Works

### Step 1: Launcher Starts
When we run `node tools/lib/claude-launcher.js`:
1. The script loads and immediately replaces `global.fetch`
2. Our replacement function wraps the original fetch

### Step 2: Claude Loads
The `import('@anthropic-ai/claude-code/cli.js')` line:
1. Dynamically imports Claude's CLI
2. Claude starts running in the same process
3. Claude sees our monkey-patched fetch as the "normal" fetch

### Step 3: Network Interception
When Claude makes an API call:
1. It calls `fetch('https://api.anthropic.com/...')`
2. Our wrapper function executes:
   - Sends `{type: 'fetch-start'}` to parent via fd 3
   - Calls the real fetch
   - When promise resolves, sends `{type: 'fetch-end'}`
3. Claude gets the normal API response

### Step 4: Parent Process (tl-wrap.js) Receives Messages
The parent reads from fd 3 and:
- On 'fetch-start': Changes state to WORKING
- On 'fetch-end': Changes state to IDLE (after 500ms debounce)

## ✅ Testing Phase 1 (Complete with Vitest Framework)

### Automated Testing (Vitest)
```bash
# Run all tests
npm run test

# Run tests in CI mode (used by GitHub Actions)
npm run test:ci

# Watch mode for development
npm run test --watch
```

**✅ Test Suite Coverage:**
1. **Launcher file exists** - Verifies `tools/lib/claude-launcher.cjs` is present
2. **Claude dependency installed** - Confirms @anthropic-ai/claude-code is available
3. **Launcher starts correctly** - Tests Claude startup and help display
4. **Network spy messages work** - Validates fetch interception and fd 3 communication

### Manual Testing (Command Line)

### Test 1: Basic Launcher Execution
```bash
# Should start Claude normally
node tools/lib/claude-launcher.cjs

# Should show Claude help
node tools/lib/claude-launcher.cjs --help
```

### Test 2: Verify Spy Messages
```bash
# Redirect fd 3 to see spy messages
node tools/lib/claude-launcher.cjs 3>&1 1>/dev/null 2>&1

# In Claude, type something that triggers API call
# Should see JSON messages like:
# {"type":"fetch-start","id":1,"hostname":"api.anthropic.com",...}
# {"type":"fetch-end","id":1,...}
```

### Test 3: Compare with Direct Claude
```bash
# Direct Claude (current approach)
claude

# Via launcher (should behave identically from user perspective)
node tools/lib/claude-launcher.cjs
```

## ✅ Success Criteria (ALL COMPLETE)

✅ **Phase 1 is complete when**:
1. ✅ Launcher script created and runs without errors (`tools/lib/claude-launcher.cjs`)
2. ✅ Claude starts and functions normally through launcher
3. ✅ Spy messages appear on fd 3 during API calls
4. ✅ No visible difference to user experience
5. ✅ All Claude features work (commands, arguments, etc.)

## ✅ Additional Achievements
6. ✅ **Comprehensive Vitest test suite** - All 4 integration tests passing
7. ✅ **CI/CD integration** - Automated testing in GitHub Actions
8. ✅ **Proper dependency management** - @anthropic-ai/claude-code bundled as project dependency
9. ✅ **Manual testing documentation** - Clear command-line testing instructions

## Common Issues & Solutions

### Issue: "Cannot find module '@anthropic-ai/claude-code/cli.js'"
**Solution**: Ensure Claude is installed: `npm install -g @anthropic-ai/claude-code`

### Issue: No spy messages appearing
**Solution**: Check if fd 3 is properly redirected. Try: `3>&1` to redirect to stdout

### Issue: Claude doesn't start
**Solution**: Test direct import: `node -e "import('@anthropic-ai/claude-code/cli.js')"`

## Attribution

This implementation is based on @happy-coder's network interception technique:
- Original repository: https://github.com/happy-coder/happy-cli
- Specific file: `scripts/claude_local_launcher.cjs`
- License: MIT

Core innovations by @happy-coder:
- Monkey-patching fetch before Claude loads
- Using fd 3 for parent-child communication
- Debounced state transitions

## State Detection Strategy

### Phase 1 Result:
```
WORKING state → Network detection (fetch-start event) ✅ 
IDLE state    → Network detection (fetch-end + 500ms) ✅
PENDING state → Not yet implemented (coming in later phase)
```

### Complete Network Detection (Future Phases):
We'll enhance the launcher to detect PENDING by:
1. Analyzing the API request body for tool use requests
2. Detecting when Claude is waiting for permission
3. This will completely replace pattern detection

### Pattern Detection as Fallback:
- Pattern detection will ONLY be used if network detection fails
- Not as primary detection method
- Ensures graceful degradation

## Integration Note for Phase 2

When integrating into `tl-wrap.js`, the condition will be:
```javascript
if (command === 'claude' && process.env.TALLR_LAUNCHER_MODE === 'true') {
    // Use launcher with network detection
    ptyProcess = spawn('node', ['tools/lib/claude-launcher.js'], ...);
} else {
    // Use existing pattern detection for:
    // - Gemini
    // - Codex  
    // - Claude when launcher is disabled
    ptyProcess = spawn(command, commandArgs, ...);
}
```

## ✅ Implementation Complete

**Phase 1 is fully implemented and tested.** All components working correctly:

### Deliverables Created:
- ✅ **Launcher Script**: `tools/lib/claude-launcher.cjs` with @happy-coder's proven network interception
- ✅ **Test Suite**: Comprehensive Vitest integration tests with 4 test cases
- ✅ **CI/CD Integration**: Automated testing in GitHub Actions pipeline
- ✅ **Documentation**: Complete implementation and testing documentation

### Technical Implementation:
- ✅ **Monkey-patch Architecture**: Pre-load fetch interception working correctly
- ✅ **Network Detection**: fetch-start/fetch-end events captured via fd 3
- ✅ **Claude Compatibility**: Zero impact on Claude Code functionality
- ✅ **Dependency Management**: @anthropic-ai/claude-code bundled as project dependency

## Next Phase: Integration

**READY FOR PHASE 2**: Integrate launcher into tl-wrap.js (Claude only)

### Upcoming Phases:
- **Phase 2**: Integrate launcher into tl-wrap.js with `TALLR_LAUNCHER_MODE` environment variable
- **Phase 3**: Connect to state tracker for actual state management
- **Phase 4**: Add PENDING detection via API request/response analysis
- **Phase 5**: Create similar launchers for Gemini and Codex
- **Phase 6**: Unify all agents under network detection

---

## Phase 1: COMPLETE ✅

This standalone launcher implementation provides the foundation for accurate network-based state detection. All testing confirms the approach is sound and ready for integration into the main Tallr application.