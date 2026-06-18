# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
npm install                  # Install dependencies
npm run tauri:dev           # Start development server (frontend + backend)
npm run dev                 # Start Vite dev server only
npm run build               # Build production bundle
npm run tauri:build         # Build Tauri app for release
```

### CLI Development & Testing
```bash
./tools/tallr claude        # Test CLI wrapper locally (recommended)
tallr claude               # Uses globally installed version (production)
```

**Important**: Always use `./tools/tallr` for testing during development, as it uses the local code. The global `tallr` command uses the last production build.

### Debugging & Logging
```bash
# View real-time logs (recommended for development)
tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq '.'

# Debug mode - verbose CLI output
DEBUG=tallr:network ./tools/tallr claude

# Rust backend verbose logging
RUST_LOG=debug npm run tauri:dev

# Test state detection patterns
./tools/tallr bash ./tools/examples/test-waiting-user.sh  # PENDING state
./tools/tallr bash ./tools/examples/test-error.sh        # ERROR state
./tools/tallr bash ./tools/examples/test-success.sh      # WORKING→DONE
```

### Testing Network Detection
Network detection is enabled by default for Claude. Test with:
```bash
./tools/tallr claude
# In separate terminal:
tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq 'select(.namespace == "tallr:network")'
```

## Architecture Overview

### Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS + Vite
- **Backend**: Rust + Tauri v2 + Axum HTTP server
- **CLI**: Node.js wrapper with state detection
- **Desktop**: macOS-native app with system tray integration

### Core Architecture

**Three-tier system:**
1. **CLI Wrapper** (`tools/`) - Node.js process that wraps AI tools and detects state changes
2. **HTTP Server** (Rust) - Local server on port 4317 that receives state updates from CLI
3. **Frontend** (React) - Desktop UI that displays sessions and manages user interactions

### Key Components

**Frontend (`src/`)**
- `App.tsx` - Main application component with task management and view modes
- `hooks/useAppState.ts` - Central state management for tasks and projects
- `services/api.ts` - HTTP client for communicating with Rust backend
- `components/TaskRow.tsx` - Individual session/task display component

**Backend (`src-tauri/src/`)**
- `lib.rs` - Main Tauri setup and HTTP server initialization
- `handlers.rs` - HTTP API endpoints for task management
- `state.rs` - Application state management and persistence
- `commands.rs` - Tauri commands exposed to frontend

**CLI Wrapper (`tools/`)**
- `tallr` - Entry point script with environment setup
- `tl-wrap.js` - Core wrapper logic and process management
- `lib/state-tracker.js` - Pattern-based and network-based state detection
- `lib/http-client.js` - Communication with local HTTP server

### State Detection System

**Dual Detection Approach:**
1. **Pattern Detection** - Regex patterns matching AI tool output
2. **Network Detection** - Monitoring HTTP requests to AI APIs (Claude default)

**State Flow:**
- `PENDING` - AI is waiting for user input
- `WORKING` - AI is actively processing
- `IDLE` - No activity detected
- `DONE` - Process completed successfully
- `ERROR` - Process failed
- `CANCELLED` - User interrupted process

### Data Flow

1. User runs `tallr claude` in terminal
2. CLI wrapper spawns the AI process and monitors output/network
3. State changes are sent to HTTP server (port 4317)
4. Rust backend updates application state and notifies frontend
5. React frontend updates UI and shows notifications

### Project Structure

```
src/                     # React frontend
├── components/          # UI components (TaskRow, Toolbar, etc.)
├── hooks/              # Custom React hooks (useAppState, useSettings)
├── services/           # API clients and external services
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/                # Rust source code
├── capabilities/       # Tauri security permissions
└── Cargo.toml         # Rust dependencies

tools/                  # CLI wrapper
├── tallr              # Main entry point
├── tl-wrap.js         # Core wrapper logic
├── lib/               # Supporting modules
└── examples/          # Test scripts for state detection
```

### Settings & Configuration

**App Settings** (stored in `~/Library/Application Support/[dev.]tallr.app/settings.json`):
- `alwaysOnTop` - Keep window above other apps
- `notificationsEnabled` - Show native notifications
- `theme` - Light/dark mode preference
- `viewMode` - Display format (normal/compact/tally)
- `autoSortTasks` - Automatic task ordering
- `groupByProject` - Column-based project grouping

**Environment Variables:**
- `TL_PROJECT` - Override project name
- `TL_REPO` - Override repository path
- `TL_IDE` - Preferred IDE (cursor, code, zed, etc.)
- `TALLR_TOKEN` - Authentication token
- `DEBUG=tallr:*` - Enable debug logging

### HTTP API Endpoints

The Rust backend exposes these endpoints on `127.0.0.1:4317`:

```
GET  /v1/state                    # Get all tasks and projects
POST /v1/tasks/upsert            # Create or update task
POST /v1/tasks/state             # Update task state
POST /v1/tasks/details           # Update task details
POST /v1/tasks/done              # Mark task as done
POST /v1/tasks/pin               # Toggle task pin status
GET  /v1/setup/status            # Get setup completion status
GET  /v1/health                  # Health check
```

### Security Model

- Local-only HTTP server (127.0.0.1:4317)
- Authentication token system for CLI-to-server communication
- Tauri capabilities restrict system access
- No external network connections from the desktop app

## Development Workflow

1. **Setup**: Run `npm install` to install dependencies
2. **Start Dev Server**: Use `npm run tauri:dev` for full stack development
3. **Test CLI Changes**: Use `./tools/tallr claude` to test wrapper changes
4. **Check Logs**: Monitor logs in separate terminal for debugging
5. **Build & Test**: Run `npm run tauri:build` before submitting changes

### Common Development Tasks

**Adding New State Detection Patterns:**
- Edit `tools/lib/patterns.js` for pattern-based detection
- Test with example scripts in `tools/examples/`

**Modifying Frontend:**
- React components auto-reload with Vite HMR
- State management centralized in `useAppState` hook

**Backend Changes:**
- Rust code auto-recompiles during `tauri:dev`
- HTTP endpoints defined in `handlers.rs`

**CLI Wrapper Updates:**
- Changes reflected immediately when using `./tools/tallr`
- No build step required for Node.js code

## Key File Locations

- **Main Config**: `package.json`, `src-tauri/tauri.conf.json`
- **Settings**: `~/Library/Application Support/Tallr/settings.json`
- **Logs**: `~/Library/Application Support/Tallr/logs/`
- **Auth Token**: `~/Library/Application Support/Tallr/.auth_token`
- **CLI Global Install**: `/usr/local/bin/tallr` (symlink)

## Important Notes

- **macOS Only**: Currently supports macOS 13+ due to Tauri v2 requirements
- **Node.js 20.19+**: Required for ES modules and modern features
- **Local Development**: CLI and app communicate via localhost:4317
- **Hot Reload**: Frontend changes reload automatically, backend recompiles
- **Network Detection**: Preferred over pattern detection for accuracy (Claude default)