# Tallr Project Context

**AI CLI session monitoring dashboard** - Tracks AI coding assistants (Claude, etc.) across projects with real-time state detection and native notifications.

## Tech Stack

- **Frontend**: React 19, TypeScript 5.7, Vite 7, Tailwind CSS 4
- **Backend**: Rust, Tauri v2, Axum 0.8  
- **CLI**: Node.js 20+, node-pty, split2, strip-ansi
- **Platform**: macOS 13+ (Tauri v2 requirement)

## Essential Commands

```bash
# Development
npm run tauri:dev        # Start dev server with hot reload
npm run build            # TypeScript check + Vite build
npm run tauri:build      # Build production app

# Testing
./tools/tallr claude     # Test CLI wrapper
curl -X POST http://127.0.0.1:4317/v1/tasks/upsert \
  -H "Content-Type: application/json" \
  -d '{"project":{"name":"test","repoPath":"'$(pwd)'"},"task":{"id":"test-1","agent":"claude","title":"Test","state":"PENDING"}}'

# Debugging
DEBUG=1 ./tools/tallr claude   # Verbose CLI output
Cmd+Option+I                    # Open React DevTools
```

## Project Structure

```
src/                    # React frontend
├── App.tsx            # Root component, state orchestration
├── components/        # UI components (TaskRow, EmptyState, SetupWizard)
├── hooks/            # Custom hooks (useAppState, useSettings)
└── services/         # API and notification services

src-tauri/            # Rust backend  
├── src/lib.rs       # HTTP server (port 4317) + Tauri events
└── capabilities/    # Security permissions

tools/               # CLI wrapper
├── tallr           # Shell entry point
├── tl-wrap.js      # Main PTY wrapper
└── lib/           # State tracking, HTTP client
```

## Core Patterns

### State Flow
1. CLI output → Node.js wrapper detects patterns → HTTP POST to :4317
2. Rust server updates state → Emits Tauri events → React UI updates
3. User clicks task → Tauri command → Opens IDE + terminal

### Task States
- **IDLE**: No active work
- **WORKING**: AI processing (show spinner)
- **PENDING**: Needs user input (send notification)
- **DONE**: Completed (auto-remove after 30s)
- **ERROR**: Failed (highlight in red)

**State Flow**: IDLE → WORKING → PENDING → DONE/ERROR → IDLE

### State Detection Patterns
```javascript
// tools/lib/patterns.js
PENDING: /❯\s*\d+\.\s+|Approve\?\s*\[y\/N\]|\[y\/n\]/i
WORKING: /esc to interrupt|working\.\.\./i
ERROR: /error|failed|exception/i
```

## Code Conventions

### TypeScript/React
- Use TypeScript strict mode
- Custom hooks for state management (no Redux/Zustand)
- Prefer `useCallback` for event handlers
- Use `useMemo` for expensive computations
- Error boundaries with try-catch in async operations

### Import Patterns
```typescript
// External first, then internal
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AppState } from '@/types';
import { useAppState } from '@/hooks/useAppState';
```

### Rust Patterns
```rust
#[tauri::command]
async fn command_name(app: AppHandle, param: Type) -> Result<ReturnType, String> {
    // Always return Result with descriptive error strings
    .map_err(|e| format!("Failed to X: {}", e))?
}
```

### External Tools
ALWAYS prefer industry-standard packages:
- Use `strip-ansi` for ANSI removal (not custom regex)
- Use `split2` for stream line splitting
- Use `node-pty` for terminal emulation

## Critical Context

### HTTP Gateway
- **Dev Port**: 4317 (development builds)
- **Prod Port**: 4318 (production builds)
- **Localhost only**: 127.0.0.1 binding
- **Auth**: Optional via `TALLR_TOKEN` env var
- **No Fallback Ports**: Health checks and connections should be deterministic - detect environment and connect to correct port immediately
- **Endpoints**: `/v1/tasks/upsert`, `/v1/tasks/state`, `/v1/tasks/done`, `/v1/debug/update`

**Example Response**:
```json
{"success": true, "message": "Task updated"}
```

### Window Management
- Always-on-top enabled by default
- Follows desktop spaces (`visibleOnAllWorkspaces`)
- Position/size saved to `~/Library/Application Support/*/settings.json`

### IDE Detection
Auto-detects: VS Code, Cursor, Zed, WebStorm, JetBrains IDEs, Windsurf
Override: `export TL_IDE=cursor`

### Notifications
- Only send for PENDING state transitions
- Include project name and task title
- Auto-dismiss after user returns to terminal

### Logging
- Logs stored in `~/Library/Application Support/Tallr/logs/`
- `tallr.log` - Backend operations (HTTP, state changes, errors)
- `cli-wrapper.log` - CLI monitoring (state detection, API calls)
- Enable verbose: `DEBUG=1` for CLI, `RUST_LOG=debug` for backend

## Development Rules

### Before Committing
1. Run TypeScript compiler: `npm run build`
2. Test with real CLI: `./tools/tallr claude`
3. Verify no console.log statements in production code
4. Check Tauri permissions if adding new APIs

### Testing Approach
- Manual testing with real AI tools (no mocks)
- Use curl for HTTP gateway testing
- Cross-terminal testing (Terminal.app, iTerm2, Warp)
- Test state detection with `tools/examples/` scripts (see CONTRIBUTING.md)

### Error Handling
- Never swallow errors silently
- Log errors with context: `console.error("Action failed:", error)`
- Show user-friendly messages in UI
- Return descriptive error strings from Rust

## Important Notes

- **No Redux/MobX**: State managed via custom hooks + Tauri events
- **No custom ANSI parsing**: Use strip-ansi package
- **No process.exit()**: Let PTY handle process lifecycle
- **No hardcoded paths**: Use Tauri's path API for app data
- **Minimal comments**: Code should be self-documenting
- **Security**: Never log sensitive data or authentication tokens

## Quick Fixes

**State not updating?**
- Check HTTP server on correct port (dev: 4317, prod: 4318)
- Verify Tauri event listeners
- Ensure PTY output parsing
- Check for port conflicts - no fallback logic should mask real issues

**IDE not opening?**
- Check Terminal automation permissions
- Verify IDE command in PATH
- Test with `which cursor`

**Notifications failing?**
- Check macOS notification permissions
- Verify Tauri notification plugin loaded