# Tally

A lightweight **floating window hub** that shows the live status of your **AI coding agents/CLIs** across projects, **notifies** you when any is *waiting on you*, and **jumps** you into the right IDE + terminal in one click.

## Core MVP Features

- ✅ **Automatic Session Tracking**: Just type `claude` - it's automatically tracked
- ✅ **Hybrid Notifications**: Mac desktop alerts + visual indicators when input needed
- ✅ **Session Dashboard**: See all active sessions at a glance with real-time updates
- ✅ **One-Click Resume**: Click any session to jump back to IDE + terminal
- 🚧 **Persistent Sessions**: Sessions survive app restarts (JSON storage - to implement)
- ✅ **Search & Filter**: Find sessions by project name or state
- ✅ **Keyboard Shortcuts**: ⌘K quick switcher, arrow navigation
- 🚧 **Visual State Indicators**: Pulsing amber rows, color-coded tray icon (to implement)

## Quick Start

### For Users (Production) 
1. **Download**: Get `Tally.dmg` from releases
2. **Install**: Drag `Tally.app` to Applications folder  
3. **Setup**: Launch Tally → Click "Install CLI Tools" → Done!
4. **Use**: `cd your-project && claude` (works just like before, now tracked!)

### For Development
```bash
# macOS only, requires: Node 20.19+, Rust + Cargo, Xcode Command Line Tools
cd tally
npm install

# Run development server (includes both frontend and backend)
npm run tauri:dev
```

> **Setup Note**: The "Install CLI Tools" wizard is not yet implemented. The shell wrapper (`tools/tl-wrap.js`) exists but needs UI for automatic installation.

📖 **For detailed setup instructions, troubleshooting, and development workflows, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

## Tech Stack (Modern 2025)

- **Frontend**: React 19.0.0 + TypeScript 5.7.2 + Vite 7.0.6
- **Backend**: Rust + Tauri v2.1.1 + Axum 0.8
- **Build**: Vite 7 with Rolldown bundler
- **Desktop**: macOS native with system tray and notifications
- **Requirements**: Node.js 20.19+, Rust latest stable

## Core Use Cases

### 1. Track Claude Sessions Automatically
```bash
# Just use Claude normally - now it's automatically tracked!
cd my-project
claude                    # Session appears in Tally dashboard

# Shows: "my-project - Claude session" with live state updates
```

### 2. Get Notified When Input Needed
```bash
# When Claude asks "Approve? [y/N]":
# ✅ Mac desktop notification appears
# ✅ Task row pulses amber in Tally window (to be implemented)
# ✅ System tray icon changes color (to be implemented)
# ✅ Click notification or task to jump back
```

### 3. Resume Sessions After Breaks
```bash
# After restarting Tally or coming back later:
# ✅ Previous sessions still visible (needs persistent storage)
# ✅ Click any waiting session to continue where you left off
```

### Testing During Development
```bash
# Test with example scripts to verify functionality
./tools/examples/test-waiting-user.sh   # Triggers notification
./tools/examples/test-error.sh          # Shows error state
./tools/examples/test-success.sh        # Successful completion
```

### Manual API Testing (Advanced)
```bash
export TALLY_TOKEN=devtoken

# Create a task manually
curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project":{"name":"test","repoPath":"'$(pwd)'"},"task":{"id":"test-1","agent":"manual","title":"Testing","state":"RUNNING"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

## API Reference

### 1. Upsert Project + Task
`POST http://127.0.0.1:4317/v1/tasks/upsert`

```json
{
  "project": {
    "name": "course-rater",
    "repoPath": "/Users/you/dev/course-rater",
    "preferredIDE": "cursor",
    "githubUrl": "https://github.com/you/course-rater"
  },
  "task": {
    "id": "cr-task-1",
    "agent": "claude",
    "title": "Set up database",
    "state": "WAITING_USER",
    "details": "Approve schema? [y/N]"
  }
}
```

### 2. Update Task State
`POST http://127.0.0.1:4317/v1/tasks/state`

```json
{
  "taskId": "cr-task-1",
  "state": "RUNNING",
  "details": "Applying migrations..."
}
```

### 3. Mark Task Done
`POST http://127.0.0.1:4317/v1/tasks/done`

```json
{
  "taskId": "cr-task-1",
  "details": "Database setup complete"
}
```

## Architecture

```
[AI Agents / tl-wrap.js]
     │  HTTP POST (localhost:4317, Bearer token)
     ▼
[Axum 0.8 Gateway in Tauri v2] ──> In-memory Store + JSON
     │   emits events + notifications
     ▼
[React 19 Panel (Floating)] ──> Jump to context (IDE + Terminal)
     │
[System Tray Icon] ──> Visual state indicator
```

**Modern Features:**
- **Tauri v2 Plugins**: Shell, notifications, and tray via plugin system
- **Axum 0.8**: Modern async Rust web framework with improved error handling
- **React 19**: Server Actions, React Compiler, enhanced form handling
- **Vite 7**: Rolldown bundler for 100x memory reduction
- **Capabilities**: Tauri v2 security model replacing allowlist

## MVP Implementation Status

### ✅ What's Working
- HTTP gateway with all API endpoints (upsert, state, done)
- Real-time UI updates via Tauri v2 events
- Mac desktop notifications on WAITING_USER/ERROR
- Frontend dashboard with search/filtering
- IDE integration (opens Cursor/VS Code)
- Terminal automation (opens Terminal.app at project)
- System tray icon (basic implementation)

### 🚧 Critical Missing Features
1. **JSON Persistence**: Sessions lost on app restart - needs save/load to `~/Library/Application Support/Tally/`
2. **Setup Wizard**: No UI for shell integration - wrapper exists but needs auto-installation
3. **Visual Indicators**: No pulsing rows or tray color changes for waiting tasks
4. **Project Deduplication**: Creates duplicate projects instead of reusing existing ones

### 📋 Next Implementation Priority
1. Add persistent storage (JSON file)
2. Build setup wizard UI
3. Add visual notification indicators (CSS animations)
4. Fix project deduplication logic

### Smoke Test Checklist
- [ ] Launch app → see floating window and system tray icon
- [ ] Run `./tools/examples/test-waiting-user.sh` → see desktop notification
- [ ] Click notification or task row → opens IDE + Terminal at project
- [ ] Search for tasks by project name or state
- [ ] Sessions persist after app restart (needs implementation)

## Future Features (Deferred)

These features are intentionally moved to future iterations to keep the MVP focused:

- **Project Timers**: Pomodoro-style timeboxing with alerts
- **GitHub Integration**: Display repo URLs and commit info
- **Multiple IDE Support**: Per-project IDE preferences  
- **iTerm2 Support**: Beyond just Terminal.app
- **Advanced Search**: Complex filtering and project history
- **Team Features**: Sharing tasks or notifications
- **Cross-platform**: Windows/Linux support

## Development Notes

- **Persistence**: Will save to `~/Library/Application Support/Tally/snapshot.json`
- **Logs**: Check Tauri dev tools console (`Cmd+Option+I`)
- **Hot Reload**: Both React 19 frontend and Rust backend support live updates
- **Testing**: Use `tools/examples/` scripts to test different states

## License

MIT
