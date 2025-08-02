# Tally

A lightweight **floating window hub** that shows the live status of your **AI coding agents/CLIs** across projects, **notifies** you when any is *waiting on you*, and **jumps** you into the right IDE + terminal in one click.

## Features (MVP)

- ✅ **Real-time updates**: Tauri events replace polling (≤2s latency)
- ✅ **Desktop notifications**: Get notified on WAITING_USER/ERROR states  
- ✅ **Jump to context**: Click any task to open IDE (Cursor/VS Code) + Terminal
- ✅ **Floating window**: Always-on-top option with pin button
- ✅ **Search & filter**: Find tasks by project, state, or agent
- ✅ **System tray**: Icon with tooltip showing aggregate state
- ✅ **Timers**: Project timeboxing (25/45/60 min) with live countdown
- ✅ **Keyboard shortcuts**: ⌘K quick switcher, arrow navigation
- 🚧 **Row actions**: Additional quick actions - coming soon

## Quick Start (Development)

```bash
# macOS only, requires: Node 20.19+, Rust + Cargo, Xcode Command Line Tools
cd tally
npm install

# Run development server (includes both frontend and backend)
npm run tauri:dev
```

> First run: Authorize **Notifications** and **Automation** when macOS prompts.

📖 **For detailed setup instructions, troubleshooting, and development workflows, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

## Tech Stack (Modern 2025)

- **Frontend**: React 19.0.0 + TypeScript 5.7.2 + Vite 7.0.6
- **Backend**: Rust + Tauri v2.1.1 + Axum 0.8
- **Build**: Vite 7 with Rolldown bundler
- **Desktop**: macOS native with system tray and notifications
- **Requirements**: Node.js 20.19+, Rust latest stable

## Testing the Gateway

### Basic test
```bash
export TALLY_TOKEN=devtoken

# Create a task in WAITING_USER state
./tools/examples/post-waiting.sh

# Mark task as done
./tools/examples/complete-task.sh
```

### Using the wrapper with Claude CLI
```bash
export TALLY_TOKEN=devtoken
export TL_PROJECT="my-project"
export TL_REPO="/Users/you/dev/my-project"
export TL_AGENT="claude"
export TL_TITLE="Implement feature X"

node tools/tl-wrap.js claude --help  # Replace with your actual Claude command
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

## Smoke Test Checklist

- [ ] Launch app, see floating window and system tray icon
- [ ] Run `post-waiting.sh` - see desktop notification
- [ ] Click notification or task row - opens IDE + Terminal
- [ ] Search for task by project name or state
- [ ] Pin window with 📌 button - stays on top
- [ ] Run `complete-task.sh` - task shows as DONE
- [ ] Check system tray tooltip reflects state

## Development Notes

- State persistence: `~/Library/Application Support/Tally/snapshot.json`
- Logs: Check Tauri dev tools console (Cmd+Option+I)
- Icons: Place in `src-tauri/icons/` (32x32 PNG with transparency)
- Hot reload: Both frontend (React 19) and backend (Rust) support live updates

## License

MIT
