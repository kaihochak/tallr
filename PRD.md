# PRD.md

# Tally — MVP PRD (Fresh Tauri v2 Implementation)

## One-liner
A lightweight **floating window hub** that shows the live status of your **AI coding agents/CLIs** across projects, **notifies** you when any is *waiting on you*, and **jumps** you into the right IDE + terminal in one click.

## Goals
1) **Aggregate visibility** of agent tasks across repos.  
2) **Instant signal** on `WAITING_USER` / `ERROR`.  
3) **One-click jump** to IDE (Cursor/VS Code) + terminal in the repo.  
4) **Light timeboxing** per project (soft alerts).

### Non-Goals (MVP)
- No cloud, accounts, team features, auto-updates.
- No SQLite (JSON persistence only).
- No MCP server (HTTP localhost only).
- No Windows/Linux.

## Users & JTBD
- Indie/enterprise devs juggling multiple AI CLIs (Claude CLI, Gemini CLI, Codecs, etc.) and tools (Cursor/VS Code).  
**JTBD:** *When agents run across multiple repos, I need a single place that shows who needs my input and lets me jump back instantly without losing focus.*

## Primary Use Cases & Acceptance
1. **See status at a glance**  
   - Panel lists projects/tasks with state + age.  
   - **Accept:** Updates appear ≤ **2s** after POST.

2. **Be alerted when agent needs me**  
   - System notification on `WAITING_USER` / `ERROR`.  
   - **Accept:** Clicking notification jumps to repo in IDE and opens/focuses terminal tab at repo.

3. **Jump to context**  
   - Clicking a row triggers IDE focus/open and terminal tab in repo.  
   - **Accept:** Succeeds ≥ **95%** in manual test on macOS.

4. **Light timeboxing**  
   - Start/stop per-project timers with 25/45/60-min alerts.  
   - **Accept:** Alerts fire while app is running.

5. **Manual quick actions**  
   - Row actions: Open IDE, Open Terminal, Open GitHub, Mark Resolved, Snooze (10/30/60m).  
   - **Accept:** Actions execute without error.

## UX (macOS)
- **System tray icon** color = aggregate state (Green=OK, Amber=Waiting, Red=Error).  
- **Floating panel:** search/filter (project/state/agent); rows show `[Project] — Task — State — age — (…)`.  
- **Keyboard:** `⌘K` quick switch; `↑/↓` navigate; `Enter` jump.  
- **Notifications:** on `WAITING_USER` + `ERROR`, clickable.  
- Friendly empty state & basic accessibility (focus order, contrast).

## State Model & Data
**States:** `RUNNING`, `WAITING_USER`, `BLOCKED`, `ERROR`, `DONE`, `IDLE`.

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
  state: 'RUNNING'|'WAITING_USER'|'BLOCKED'|'ERROR'|'DONE'|'IDLE';
  details?: string;       // last significant line
  lastEventAt: number;
  createdAt: number;
  updatedAt: number;
  snoozedUntil?: number;  // epoch ms
}

interface Timer {
  projectId: string;
  isRunning: boolean;
  startedAt?: number;
  elapsedMsTotal: number;
  softLimitMinutes?: number; // 25/45/60
}
```

## Integration Interface

### Local HTTP Gateway
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
    "title": "Set up Supabase auth",
    "state": "WAITING_USER",
    "details": "Approve schema migration? [y/N]"
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

### Priority Integrations
- **Agents:** **Claude CLI** (top), **Gemini CLI**, generic "custom".  
- **IDEs:** **Cursor → VS Code** (order of focus attempts).  
- **Terminals:** Terminal.app or iTerm2 (user choice).

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

## Timeline
**Delivered:** Modern Tauri v2 implementation with React 19 + Vite 7 + Axum 0.8

**Status:** ✅ **Core infrastructure complete** - HTTP gateway, real-time events, notifications, tray integration all implemented with modern tech stack.

**Next:** Frontend UI components, testing suite, and integration validation.