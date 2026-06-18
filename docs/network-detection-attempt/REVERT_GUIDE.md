# Revert Guide - Network Detection Changes

## Files Modified During Network Detection Attempt

### Primary Files to Revert
1. **`tools/lib/process-manager.js`**
   - Remove: IPC file monitoring setup
   - Remove: Hook IPC cleanup in exit/error handlers
   - Remove: setupHookIPC function and fs imports

2. **`tools/lib/network-launcher.js`**
   - Remove: Signal handling changes (cleanup function)
   - Remove: IPC monitoring in launcher mode
   - Remove: Promise-based return (should return boolean)
   - Restore: Simple return true/false behavior

3. **`tools/lib/claude-hooks.js`**
   - Remove: IPC-based hook commands
   - Restore: Direct HTTP calls to Tallr backend
   - Fix: Hook setup to use proper session integration

4. **`tools/tl-wrap.js`**
   - Remove: Automatic hook setup on Claude startup
   - Keep: Basic structure but remove hook integration

### Files to Keep (Working Components)
- `tools/lib/claude-launcher.cjs` - Standalone launcher works well
- Test files - For future reference
- Core pattern detection - Still working

### Issues to Fix
1. **Session Management**
   - Ctrl+C should properly clean up sessions
   - Frontend should receive state updates
   - No session fragmentation

2. **Hook Integration**
   - Hooks should update existing session, not create new ones
   - Remove file-based IPC system
   - Use proper state tracker integration

3. **Signal Handling**
   - Network launcher cleanup breaking process exit
   - Process management not handling signals properly

## Quick Revert Command
```bash
# Create backup
git stash push -m "network-detection-changes-backup"

# Or if you want to revert specific files:
git checkout HEAD -- tools/lib/process-manager.js
git checkout HEAD -- tools/lib/network-launcher.js
git checkout HEAD -- tools/lib/claude-hooks.js
git checkout HEAD -- tools/tl-wrap.js
```

## Working State Target
- **Pattern detection**: Working for all states (IDLE, WORKING, PENDING)
- **Session management**: Ctrl+C cleanup working
- **Frontend**: Receiving updates properly
- **No fragmentation**: One session per CLI invocation

## Validation After Revert
1. `./tools/tallr claude` - Should start and exit cleanly with Ctrl+C
2. Frontend shows updates during session
3. Tool calls update existing session, don't create new ones
4. No IPC files left behind: `ls .tallr-session-ipc` should not exist

## Date
January 2025