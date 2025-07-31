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
# macOS only, requires: Node 18+, Rust + Cargo, Xcode Command Line Tools
cd tally
npm install

# Terminal 1: Run Vite dev server
npm run dev

# Terminal 2: Run Tauri app
cd src-tauri
cargo tauri dev
```

> First run: Authorize **Notifications** and **Automation** when macOS prompts.

📖 **For detailed setup instructions, troubleshooting, and development workflows, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

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
[Axum Gateway in Tauri] ──> In-memory Store + JSON
     │   emits events + notifications
     ▼
[React Panel (Floating)] ──> Jump to context (IDE + Terminal)
     │
[System Tray Icon] ──> Visual state indicator
```

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

## License

MIT