# Tally

A lightweight **floating window hub** that shows the live status of your **AI coding agents/CLIs** across projects, **notifies** you when any is *waiting on you*, and **jumps** you into the right IDE + terminal in one click.

## What is Tally?

Tally is actually **three applications** working together to track your AI sessions:

```
Terminal Session          Desktop App
┌─────────────┐          ┌──────────────┐
│   tally     │          │   Tauri App  │
│    (bash)   │          │              │
└──────┬──────┘          │  ┌────────┐  │
       │                 │  │ React  │  │
       ▼                 │  │   UI   │  │
┌─────────────┐          │  └────▲───┘  │
│  tl-wrap.js │  HTTP    │       │      │
│   (Node.js) ├─────────►│  ┌────▼───┐  │
└─────────────┘  :4317   │  │  Rust  │  │
                         │  │ Server │  │
                         │  └────────┘  │
                         └──────────────┘
```

### 1. **Desktop App** (Tauri + React)
- **Frontend**: React UI - displays tasks, notifications
- **Backend**: Rust HTTP server on localhost:4317 
- **Role**: Main dashboard showing all your AI sessions

### 2. **CLI Wrapper** (Node.js)
- **Files**: `tools/tl-wrap.js`, `state-tracker.js`, `http-client.js`
- **Role**: Wraps Claude/other CLIs, monitors output, sends updates
- **Runs**: When you type `tally claude` in any terminal

### 3. **Shell Script** (Bash)
- **File**: `tools/tally`
- **Role**: Entry point that sets up environment and launches wrapper
- **Installed**: To `/usr/local/bin/tally` for system-wide access

## Core Features

- ✅ **Automatic Session Tracking**: Just type `tally claude` - it's automatically tracked
- ✅ **Hybrid Notifications**: Mac desktop alerts + visual indicators when input needed  
- ✅ **Session Dashboard**: See all active sessions at a glance with real-time updates
- ✅ **Always-On-Top Floating Window**: Pin button keeps window visible across all desktop spaces
- ✅ **Smart IDE Jump**: Click any session to jump back to your actual IDE (auto-detected)
- ✅ **Expandable Details**: Click to see full Claude output (last 2000 chars)
- ✅ **Search & Filter**: Find sessions by project name or state
- ✅ **Keyboard Shortcuts**: ⌘K quick switcher, arrow navigation, ⌘⇧T pin toggle

## Quick Start

### For Users (Production) 
1. **Download**: Get `Tally.dmg` from releases
2. **Install**: Drag `Tally.app` to Applications folder  
3. **Setup**: Launch Tally → Click "Install CLI Tools"
4. **Use**: Run `tally claude` in your projects

### For Development
```bash
# macOS only, requires: Node 20.19+, Rust + Cargo, Xcode Command Line Tools
cd tally
npm install

# Run development server (includes both frontend and backend)
npm run tauri:dev

# To reset setup wizard:
rm -f ~/Library/Application\ Support/Tally/.setup_completed && npm run tauri:dev
```

## Usage Guide

### Natural Workflow
```bash
# Use tally wrapper for automatic tracking
cd my-project
tally claude

# Start chatting normally in interactive mode:
> Help me debug this authentication issue
> The login form isn't working properly  
> Can you review this code change?
> /exit
```

### What Tally Adds
- **Dashboard**: See "my-project - Claude session" in Tally window with detected IDE
- **Notifications**: Desktop alert when Claude asks "Approve? [y/N]"
- **Smart Jump-to-Context**: Click task → opens your actual IDE (VS Code/Cursor/Zed/etc.) based on auto-detection
- **IDE Detection**: Automatically detects which IDE you're using and shows it in the task row
- **Always-On-Top**: Pin button keeps window floating above all apps and desktop spaces
- **History**: Track all your AI sessions across projects
- **Expandable Output**: Click expand button to see detailed Claude output

### Supported AI Tools
- **Claude Code**: `tally claude` (interactive chat) ✅ Full PTY support
- **Gemini CLI**: `tally gemini` (planned)
- **Future**: Any CLI tool that uses interactive prompts

## IDE Support

Tally automatically detects which IDE you're using and opens the correct one when you click task rows.

### Supported IDEs (Auto-detected)
- **VS Code**: `code` command
- **Cursor**: `cursor` command  
- **Zed**: `zed` command
- **WebStorm**: `webstorm` command
- **JetBrains IDEs**: IntelliJ IDEA, PyCharm, PhpStorm, CLion, GoLand, RubyMine, Rider
- **Windsurf**: `windsurf` command

### How IDE Detection Works
1. **Environment Variables**: Checks `TERM_PROGRAM`, `VSCODE_INJECTION` for VS Code/Cursor
2. **Parent Process**: Uses `ps` to identify which IDE launched the terminal
3. **Built-in Mapping**: Matches detected IDE names to command-line tools
4. **User Override**: Custom mappings via `TL_IDE` environment variable or settings file

### IDE Display
- **Task Rows**: Show detected IDE next to agent info (e.g., "claude • code")
- **Tooltip**: Hover to see "Opens in VS Code" 
- **Visual Badge**: Colored badge distinguishes IDE from agent

### Custom IDE Configuration
```bash
# Override detection for current session
export TL_IDE=cursor

# Add permanent custom mapping
./tools/tally-ide set "My Custom IDE" myide-command

# View all IDE mappings
./tools/tally-ide list

# Debug detection issues
./tools/tally-ide test
```

### Unknown IDEs
When Tally detects an unknown IDE:
1. **Smart Guess**: Tries lowercase transformation (e.g., "New IDE" → "newide")
2. **User Prompt**: Shows helpful message with commands to add custom mapping
3. **Fallback**: Opens project directory with system default if IDE command fails

### Behind the Scenes

When you run `tally claude`, Tally's CLI wrapper:
1. **Starts tracking**: Creates task "Claude session" for current project
2. **Monitors output**: Watches for approval prompts, errors (detects "esc to interrupt")
3. **Sends notifications**: Desktop alerts when Claude needs input  
4. **Enables jumping**: Click task → open IDE + terminal at project

**What Gets Auto-Detected:**
- **Project name**: From directory name or git repo
- **Repo path**: Current working directory  
- **Agent**: "claude", "gemini", etc.
- **IDE**: VS Code, Cursor, Zed, WebStorm, JetBrains IDEs, Windsurf (from environment & parent process)
- **State changes**: IDLE → WORKING → PENDING → DONE/ERROR

## Development

### Tech Stack (Modern 2025)
- **Frontend**: React 19.0.0 + TypeScript 5.7.2 + Vite 7.0.6
- **Backend**: Rust + Tauri v2.1.1 + Axum 0.8
- **Build**: Vite 7 with Rolldown bundler (100x memory reduction)
- **Desktop**: macOS native with system tray and notifications
- **CLI Wrapper**: Node.js with PTY support for interactive sessions

### Prerequisites
- **macOS 13+** (required for Tauri v2)
- **Node.js 20.19+** - [Download from nodejs.org](https://nodejs.org/)
- **Rust + Cargo** - Install via [rustup.rs](https://rustup.rs/)
- **Xcode Command Line Tools** - `xcode-select --install`

### File Structure
```
tally/
├── src/                     # React 19 frontend
│   ├── App.tsx             # Main UI component
│   ├── App.css             # Styling (includes expandable cards)
│   └── components/         # React components
├── src-tauri/              # Rust backend (Tauri v2)
│   ├── src/lib.rs          # HTTP server + event handling
│   ├── capabilities/       # Tauri v2 security permissions
│   └── Cargo.toml          # Rust dependencies
├── tools/                  # CLI wrapper (Node.js)
│   ├── tally               # Shell script entry point
│   ├── tl-wrap.js          # Main wrapper with PTY support
│   ├── lib/
│   │   ├── state-tracker.js # Detects Claude states
│   │   └── http-client.js   # API communication
│   └── examples/           # Test scripts
└── package.json            # Modern Node dependencies
```

### Development Features
- **Hot Reload**: React changes appear instantly, Rust recompiles automatically
- **Debug Tools**: `Cmd+Option+I` for frontend console, terminal for Rust logs
- **Testing**: Use `tools/examples/` scripts to test different states

### Custom Configuration
```bash
# Environment variables (optional)
export TALLY_TOKEN=devtoken     # Authentication token
export TL_IDE=cursor           # Override auto-detected IDE (cursor/code/zed/webstorm)
export TL_PROJECT="Custom Name" # Override project name

# IDE Management (manual mappings)
./tools/tally-ide list         # View current IDE mappings
./tools/tally-ide set "My IDE" myide  # Add custom IDE mapping
./tools/tally-ide test         # Debug IDE detection
```

## API Reference

### Local HTTP Gateway
- **Bind**: `127.0.0.1:4317`  
- **Auth**: Optional Bearer `TALLY_TOKEN`
- **Content-Type**: `application/json`

### 1. Upsert Project + Task
`POST /v1/tasks/upsert`

```json
{
  "project": {
    "name": "course-rater",
    "repoPath": "/Users/you/dev/course-rater",
    "preferredIde": "cursor",
    "githubUrl": "https://github.com/you/course-rater"
  },
  "task": {
    "id": "cr-task-1",
    "agent": "claude",
    "title": "Set up database",
    "state": "PENDING",
    "details": "Approve schema? [y/N]"
  }
}
```

### 2. Update Task State
`POST /v1/tasks/state`

```json
{
  "taskId": "cr-task-1",
  "state": "WORKING",
  "details": "Applying migrations... [detailed output here]"
}
```

### 3. Mark Task Done
`POST /v1/tasks/done`

```json
{
  "taskId": "cr-task-1",
  "details": "Database setup complete"
}
```

### State Model
**Simplified 3-State System:**
- **IDLE**: Default state, no active work
- **WORKING**: Claude is processing (detects "esc to interrupt")
- **PENDING**: Waiting for user input (detects "❯ 1. Yes", "[y/N]", etc.)

## Troubleshooting

### "Command not found: claude"
- Install Claude Code CLI first
- Restart terminal after Tally setup

### "Tasks not appearing in Tally"
- Ensure Tally app is running
- Check CLI installation: `which tally` should show `/usr/local/bin/tally`

### "Notifications not working"
- Allow notifications when macOS prompts
- Check System Preferences → Notifications → Tally

### "Can't click to jump to project"  
- Allow shell commands when macOS prompts
- Grant Terminal automation if prompted

### Development Issues
```bash
# Clear caches if needed
rm -rf node_modules/.vite
npm install

# Reset Tauri build
cd src-tauri && cargo clean && cargo build

# Test CLI wrapper directly
./tools/tally claude --help
```

## Implementation Status

### ✅ What's Working
- HTTP gateway with all API endpoints
- Real-time UI updates via Tauri v2 events
- Mac desktop notifications on PENDING/ERROR states
- Frontend dashboard with search/filtering and expandable output
- Always-on-top floating window with desktop space following
- **Smart IDE Integration**: Auto-detects and opens VS Code, Cursor, Zed, WebStorm, JetBrains IDEs, Windsurf
- **IDE Display**: Task rows show detected IDE with tooltip
- **User IDE Settings**: Custom mappings via `~/.tally/settings.json`
- PTY-based CLI wrapper preserving full Claude functionality
- System tray icon with basic functionality
- Settings persistence (pin state, window position, preferences)

### 🚧 In Progress
- **Output Display**: Now shows last 2000 chars of Claude output in expandable cards
- **Error Handling**: Improved retry logic and graceful degradation
- **State Detection**: Fixed "esc to interrupt" pattern matching

### ❌ Missing Features (Future)
- **Session Persistence**: Task sessions lost on app restart
- **Visual Indicators**: No pulsing rows or tray color changes
- **PATH Shims**: Users must remember `tally claude` instead of just `claude`

### Architecture Advantages
This 3-application design allows:
- **CLI wrapper** runs independently in any terminal
- **Desktop app** aggregates sessions from multiple terminals  
- **Real-time updates** via HTTP (localhost:4317)
- **Loose coupling** - each part can evolve independently

## Manual Testing

### Test Session Tracking
```bash
# Start Tally app
npm run tauri:dev

# In another terminal
cd your-project
tally claude
# → Should see task appear in Tally window
```

### Test Notifications
```bash
export TALLY_TOKEN=devtoken

# Trigger notification
curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project":{"name":"test","repoPath":"'$(pwd)'"},"task":{"id":"test-1","agent":"claude","title":"Test","state":"PENDING","details":"Approve? [y/N]"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

### Test Context Jumping
Click any task in the Tally window to trigger:
- IDE opening with `--reuse-window`
- Terminal.app opening at project directory

## License

MIT