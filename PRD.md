# PRD.md

# Tally — MVP PRD (Simplified Core Features)

## One-liner
A lightweight **floating window hub** that shows the live status of your **AI coding agents/CLIs** across projects, **notifies** you when any is *waiting on you*, and **jumps** you into the right IDE + terminal in one click.

## Core MVP Goals
1) **Aggregate visibility** of agent tasks across repos.  
2) **Instant hybrid notifications** on `WAITING_USER` / `ERROR`.  
3) **One-click jump** to IDE (Cursor/VS Code) + terminal in the repo.  
4) **Persistent sessions** that survive app restarts.

### Non-Goals (MVP)
- No cloud, accounts, team features, auto-updates.
- No SQLite (JSON persistence only).
- No MCP server (HTTP localhost only).
- No Windows/Linux.

## Users & JTBD
- Indie/enterprise devs juggling multiple AI CLIs (Claude CLI, Gemini CLI, Codecs, etc.) and tools (Cursor/VS Code).  
**JTBD:** *When agents run across multiple repos, I need a single place that shows who needs my input and lets me jump back instantly without losing focus.*

## Core Use Cases & Acceptance Criteria

### Use Case 1: Track Claude Sessions
**As a developer**, when I:
- Open terminal in my project directory  
- Type `tally claude` to start a tracked session
- **Accept:** "my-project - Claude session" appears in Tally window automatically
- **Accept:** Session state changes (WORKING → PENDING → IDLE) appear in real-time

### Use Case 2: Get Hybrid Notifications  
**When Claude shows "❯ 1. Yes" (PENDING state)**, I want:
- **Accept:** Mac desktop notification appears immediately
- **Accept:** Task row in Tally pulses amber until resolved
- **Accept:** System tray icon changes to amber color
- **Accept:** Clicking notification jumps to correct terminal

### Use Case 3: See All Sessions at a Glance
**When working on multiple projects**, I want:
- **Accept:** Floating window shows all active sessions
- **Accept:** Visual state indicators (green=running, amber=waiting, red=error)
- **Accept:** Click any session to jump to that project's terminal + IDE
- **Accept:** Search/filter by project name or state

### Use Case 4: Resume After Breaks  
**When I restart the app or come back later**, I want:
- **Accept:** Previous sessions are still visible in dashboard
- **Accept:** Can click on any waiting session to continue where I left off
- **Accept:** Session history persists across app restarts (JSON file)

## Setup (Simplified Installation)
1. **Download .dmg → drag to Applications → launch**
2. **Add `tally` to PATH** (or use full path to wrapper)
3. **Accept:** User can run `tally claude` and see it tracked

## UX (macOS - Simplified)
- **System tray icon** with color-coded aggregate state (Green=OK, Amber=Waiting, Red=Error)  
- **Floating panel:** clean task list with search/filter functionality
- **Task rows:** `[Project] — Agent — State — Age` format with visual indicators
- **Hybrid notifications:** Mac native + pulsing amber rows for `WAITING_USER`
- **Keyboard shortcuts:** `⌘K` quick switcher, `↑/↓` navigation, `Enter` to jump
- **One-click actions:** Click any task to open IDE + terminal at project location

## State Model & Data
**Simplified 3-State Model:** `WORKING`, `PENDING`, `IDLE`.
- **WORKING**: Claude is actively processing (pattern: "esc to interrupt")
- **PENDING**: Claude is waiting for user input (pattern: "❯ 1. Yes") 
- **IDLE**: Everything else (default state)

```ts
type IDE = 'cursor' | 'vscode' | 'webstorm' | 'other';

interface Project {
  id: string;
  name: string;
  repoPath: string;
  preferredIDE: IDE;
  githubUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface AgentTask {
  id: string;             // unique per run
  projectId: string;
  agent: 'claude'|'gemini'|'codecs'|'custom';
  title: string;
  state: 'WORKING'|'PENDING'|'IDLE';
  details?: string;       // last significant line
  lastEventAt: number;
  createdAt: number;
  updatedAt: number;
  snoozedUntil?: number;  // epoch ms
}

// Timer interface moved to future enhancements
```

## Integration Interface

### User Experience (Primary)
**Simple manual wrapper approach:**
```bash
cd my-project
tally claude        # Tracked Claude session
tally gemini        # Tracked Gemini session
```

**Behind the scenes:**
- Wrapper script monitors CLI output
- Auto-detect project context from current directory
- Send tracking data to local HTTP gateway
- Monitor for approval prompts and notifications

### Local HTTP Gateway (Advanced/Manual)
- **Bind:** `127.0.0.1:4317`  
- **Auth:** optional Bearer `TALLY_TOKEN` (also accepts `SWITCHBOARD_TOKEN` for compatibility)  
- **CT:** `application/json`

**1) Upsert project + task** — `POST /v1/tasks/upsert`
```json
{
  "project": {
    "name": "course-rater",
    "repoPath": "/Users/you/dev/course-rater",
    "preferredIDE": "cursor",
    "githubUrl": "https://github.com/you/course-rater"
  },
  "task": {
    "id": "cr-setup-1",
    "agent": "claude",
    "title": "Claude session",
    "state": "RUNNING",
    "details": "Interactive chat session"
  }
}
```

**2) Change state** — `POST /v1/tasks/state`
```json
{"taskId":"cr-setup-1","state":"RUNNING","details":"Applying migration..."}
```

**3) Mark done** — `POST /v1/tasks/done`
```json
{"taskId":"cr-setup-1","details":"Migration applied"}
```

> Idempotent upserts by `task.id` (+ project identity via `name`/`repoPath`).

### MVP Integrations (Core Only)
- **CLI Tools:** **Claude Code** (primary focus), extensible to other AI CLIs
- **IDEs:** **Cursor** (primary) and **VS Code** (fallback)  
- **Terminal:** **Terminal.app** (macOS default)
- **Setup:** One-click shell integration wizard

## Security & Privacy
- Localhost-only, optional bearer token.  
- No code ingestion; only minimal metadata.  
- JSON persistence in `~/Library/Application Support/Tally`.  
- No telemetry.

## Non-Functional
- Latency ≤ **2s** (POST → UI).  
- Bundle ≤ **100MB**, idle RAM ≤ **150MB**.  
- macOS 13+.  
- Crash-free sessions ≥ **99%** in internal test.

## Tech Stack (2025 Modern Implementation)
- **Shell:** Tauri v2.1.1 (Rust) + React 19.0.0 + TypeScript 5.7.2
- **Build:** Vite 7.0.6 with Rolldown bundler (100x memory reduction)
- **Gateway:** Rust + Axum 0.8 (modern async framework)
- **Storage:** in-memory + JSON persistence
- **OS Actions:** 
  - Tauri v2 shell plugin for `code --reuse-window`, `cursor --reuse-window`
  - AppleScript via shell plugin for Terminal/iTerm automation
  - Tauri v2 notification plugin for desktop notifications
- **Security:** Tauri v2 capabilities system (replaces allowlist)
- **Tests:** Rust unit/integration (routes/store), Vitest (UI), manual E2E (curl + wrapper)

## Architecture (Updated for Tauri v2)
```
[Agents / tl-wrap.js]
     │  HTTP POST (localhost:4317, bearer?)
     ▼
[Axum 0.8 Gateway in Tauri v2] ──> Store (JSON)
     │   emits events + notifications (plugin-based)
     ▼
[React 19/TS Panel + Tray] ──> Jump to context (IDE + Terminal via plugins)
```

**Key Modern Features:**
- **Plugin Architecture**: Shell, notifications, tray via Tauri v2 plugins
- **Capabilities Security**: Fine-grained permissions replacing allowlist
- **Modern Async**: Axum 0.8 with improved error handling and performance
- **React 19**: Server Actions, React Compiler, enhanced form handling
- **Vite 7**: Rolldown bundler for faster builds and lower memory usage
- **Event-Driven**: Real-time updates via Tauri v2 event system

## Development Advantages (Fresh Implementation)
- ✅ **Latest Stable Versions**: All dependencies use 2025 stable releases
- ✅ **Modern Patterns**: React 19 async patterns, Axum 0.8 extractors
- ✅ **Better Performance**: Vite 7 Rolldown, Tauri v2 optimizations
- ✅ **Enhanced Security**: Capabilities system with fine-grained control
- ✅ **Improved DX**: Better error messages, hot reload, debugging
- ✅ **Future-Proof**: Built on stable, long-term supported versions

## Implementation Status

### 🧪 MVP Features Requiring Testing (Priority Ranked)

**PRIORITY 1: Core Session Tracking**
- ✅ **P1.1 CLI Installation** - Setup wizard installs `tally` command correctly
- ✅ **P1.2 Interactive Claude Sessions** - PTY wrapper preserves full Claude CLI functionality  
- ✅ **P1.3 Session Creation** - Auto-creates tasks when `tally claude` runs
- 🧪 **P1.4 State Tracking** - Tracks state changes (RUNNING → WAITING_USER → ERROR → DONE)

**PRIORITY 2: Notification System**
- 🧪 **P2.1 Pattern Detection** - Detects "Approve? [y/N]" and error patterns in output
- 🧪 **P2.2 Mac Notifications** - Desktop alerts appear on WAITING_USER/ERROR states
- 🧪 **P2.3 Real-time Updates** - Dashboard updates immediately when state changes

**PRIORITY 3: Dashboard & Navigation**
- 🧪 **P3.1 Task Display** - Shows all active sessions with correct information
- 🧪 **P3.2 Search & Filtering** - Can filter by project name, state, agent type
- 🧪 **P3.3 Jump to Context** - Opens correct IDE + terminal at project location
- 🧪 **P3.4 Keyboard Shortcuts** - Cmd+K quick switcher, arrow navigation work

**PRIORITY 4: Backend & Integration**
- 🧪 **P4.1 HTTP Gateway** - All `/v1/tasks/*` endpoints work correctly
- 🧪 **P4.2 IDE Integration** - Opens Cursor/VS Code + Terminal.app successfully
- 🧪 **P4.3 AppleScript Automation** - Terminal automation functions properly
- 🧪 **P4.4 Empty State** - Shows usage examples when no sessions active

### 🚧 Critical Missing (MVP Blockers)
**Data Persistence**
- ❌ **Persistent Storage** - Sessions lost on app restart (need JSON file persistence)
- ❌ **Project Deduplication** - Creates new project for each task instead of reusing
- ❌ **Session History** - No historical view of completed sessions

**Visual Polish**
- ❌ **Visual Indicators** - No pulsing amber rows for waiting tasks
- ❌ **System Tray Integration** - Tray icon exists but no color changes based on state
- ❌ **Loading States** - No visual feedback during operations

**User Experience**
- ❌ **Settings/Preferences** - No configuration options for users
- ❌ **In-app Help** - No documentation or help system
- ❌ **Error Recovery** - No graceful handling of app crashes or network issues

### ❓ Needs Testing
- **Session Resumption** - Can users continue interrupted sessions?
- **Multiple Projects** - How well does it handle many concurrent sessions?
- **Performance** - Memory/CPU usage under load

### 🎯 Use Case Testing Status
1. **Track Claude Sessions** - 🧪 **NEEDS TESTING** (P1.1-P1.4)
2. **Get Hybrid Notifications** - 🧪 **NEEDS TESTING** (P2.1-P2.3)
3. **See All Sessions at a Glance** - 🧪 **NEEDS TESTING** (P3.1-P3.4)
4. **Resume After Breaks** - ❌ **NOT IMPLEMENTED** (missing persistence)

### 📊 Testing Summary
- **🧪 NEEDS TESTING (15 features)**: Systematic testing required for all MVP features
- **❌ NOT IMPLEMENTED (8 features)**: Missing features need development
- **🎯 TESTING PLAN**: Start with P1 (Core Session Tracking), then P2, P3, P4

**Current Status**: **MVP Features Built, Testing Required** - Need systematic validation of all functionality before declaring MVP complete.

### 📋 Next Steps (Updated Priority Order)
1. **Add JSON persistence** - Save to `~/Library/Application Support/Tally/sessions.json`
2. **Fix project deduplication** - Reuse existing projects by path
3. **Add visual indicators** - CSS animations for pulsing amber rows
4. **System tray colors** - Change tray icon based on aggregate state
5. **Basic settings panel** - User preferences for notifications/IDE

## Deferred Features (Future Iterations)

These features are intentionally moved to later versions to keep the MVP focused:

- **Shell Integration**: Automatic shell function installation (complex setup)
- **Project Timers**: Pomodoro-style timeboxing with alerts
- **GitHub Integration**: Display repo URLs and commit info  
- **Multiple IDE Support**: User preferences per project
- **iTerm2 Support**: Beyond just Terminal.app
- **Advanced Search**: Complex filtering and project history
- **Team Features**: Sharing tasks or notifications
- **Cloud Sync**: Cross-device session syncing
- **Windows/Linux**: Cross-platform support
- **MCP Integration**: Model Context Protocol server support
- **Custom Agents**: Beyond just Claude/Gemini CLIs