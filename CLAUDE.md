# Tallor Developer Implementation Guide

This guide provides implementation guidance for developers working on Tallor. For user documentation, see [README.md](./README.md). For product requirements, see [PRD.md](./PRD.md).

## Architecture Overview

Tallor follows a **3-application architecture**:

1. **Desktop App** (Tauri v2 + React 19) - Main dashboard and notifications
2. **CLI Wrapper** (Node.js) - Wraps AI CLIs and monitors output  
3. **Shell Integration** (Bash) - Entry point and environment setup

```
Terminal Session          Desktop App
┌─────────────┐          ┌──────────────┐
│   tallor    │          │   Tauri App  │
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

## Frontend Implementation (React 19 + TypeScript)

### Component Structure

**Main Components:**
- `App.tsx` - Root component, state orchestration
- `TaskRow.tsx` - Individual task display with expand/actions
- `EmptyState.tsx` - Usage examples when no sessions active
- `SetupWizard.tsx` - First-run CLI installation

**Custom Hooks:**
- `useAppState.ts` - HTTP gateway communication and events
- `useSettings.ts` - Settings persistence and window management

### State Management Patterns

**Global State:** Managed via custom hooks, no external store needed
```typescript
// useAppState.ts - HTTP polling + Tauri events
const { appState, isLoading, removingTasks, taskCountdowns } = useAppState();

// useSettings.ts - Persistent user preferences
const { settings, toggleAlwaysOnTop, saveWindowPosition } = useSettings();
```

**Local Component State:** React useState for UI-only state
```typescript
const [searchFilter, setSearchFilter] = useState("");
const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
```

### Data Flow

1. **CLI → Backend:** Node.js wrapper sends HTTP POST to Rust server (port 4317)
2. **Backend → Frontend:** Rust emits Tauri events to React components
3. **Frontend → Backend:** React calls Tauri commands via `invoke()`

### Window Management Implementation

**Always-On-Top with Desktop Space Following:**
```typescript
// useSettings.ts
const toggleAlwaysOnTop = useCallback(async () => {
  const window = getCurrentWindow();
  const newState = !settings.alwaysOnTop;
  
  await window.setAlwaysOnTop(newState);
  await window.setVisibleOnAllWorkspaces(newState); // Key for space following
  
  await saveSettings({ alwaysOnTop: newState, visibleOnAllWorkspaces: newState });
}, [settings.alwaysOnTop, saveSettings]);
```

**Configuration:**
```json
// tauri.conf.json
{
  "app": {
    "windows": [{
      "alwaysOnTop": true,
      "visibleOnAllWorkspaces": true
    }]
  }
}
```

## Backend Implementation (Rust + Tauri v2)

### HTTP Server (Axum 0.8)

**Gateway Routes:**
```rust
// src-tauri/src/lib.rs
let app = Router::new()
    .route("/v1/state", get(get_state))
    .route("/v1/tasks/upsert", post(upsert_task))
    .route("/v1/tasks/state", post(update_task_state))
    .route("/v1/tasks/done", post(mark_task_done));
```

**State Management:**
```rust
// Global in-memory state with Arc<Mutex>
static APP_STATE: Lazy<Arc<Mutex<AppState>>> = Lazy::new(|| {
    Arc::new(Mutex::new(AppState::default()))
});
```

### Tauri Commands

**Settings Persistence:**
```rust
#[tauri::command]
async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()?;
    let settings_file = app_data_dir.join("settings.json");
    fs::write(&settings_file, serde_json::to_string_pretty(&settings)?)?;
    Ok(())
}
```

**IDE Integration:**
```rust
#[tauri::command]
async fn open_ide_and_terminal(app: AppHandle, project_path: String, ide: Option<String>) {
    let ide_cmd = ide.unwrap_or_else(|| "cursor".to_string());
    app.shell().command(&ide_cmd).args(&[&project_path]).spawn()?;
}
```

### Event System

**Backend to Frontend:**
```rust
// Emit events to React components
let _ = app_handle.emit("tasks-updated", &state.clone());
let _ = app_handle.emit("show-notification", notification_data);
```

**Frontend Listeners:**
```typescript
// useAppState.ts
useEffect(() => {
  const unlisten = listen<AppState>("tasks-updated", (event) => {
    setAppState(event.payload);
  });
  return () => unlisten.then(fn => fn());
}, []);
```

## CLI Wrapper Implementation (Node.js)

### PTY Integration

**Full Terminal Emulation:**
```javascript
// tools/tl-wrap.js
const pty = spawn(command, args, {
  name: 'xterm-color',
  cols: process.stdout.columns,
  rows: process.stdout.rows,
  cwd: process.cwd(),
  env: process.env
});
```

**State Detection:**
```javascript
// tools/lib/state-tracker.js
const PATTERNS = {
  PENDING: /❯\s*\d+\.\s+|Approve\?\s*\[y\/N\]|\[y\/n\]/i,
  WORKING: /esc to interrupt|working\.\.\./i,
  ERROR: /error|failed|exception/i
};
```

### HTTP Communication

**Task Updates:**
```javascript
// tools/lib/http-client.js
const response = await fetch('http://127.0.0.1:4317/v1/tasks/upsert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ project, task })
});
```

## Development Workflow

### Setup
```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run tauri:dev

# Build for production
npm run tauri:build
```

### Testing Patterns

**Manual Testing:**
```bash
# Test session tracking
cd your-project && tallor claude

# Test notifications (direct API)
curl -H "Content-Type: application/json" \
     -d '{"project":{"name":"test","repoPath":"'$(pwd)'"},"task":{"id":"test-1","agent":"claude","title":"Test","state":"PENDING"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

**Debug Mode:**
- Frontend: `Cmd+Option+I` for React DevTools
- Backend: Terminal logs from Rust server
- CLI Wrapper: `DEBUG=1 tallor claude` for verbose output

### File Organization

```
src/
├── App.tsx              # Root component
├── App.css              # Global styles + CSS variables
├── components/          # UI components
│   ├── TaskRow.tsx      # Task display logic
│   ├── EmptyState.tsx   # Usage examples
│   └── SetupWizard.tsx  # CLI installation
└── hooks/               # Custom hooks
    ├── useAppState.ts   # HTTP + events
    └── useSettings.ts   # Persistence

src-tauri/
├── src/lib.rs           # Main Rust logic
├── capabilities/        # Tauri v2 permissions
│   └── default.json     # Window, shell, notification permissions
└── Cargo.toml           # Rust dependencies

tools/
├── tallor               # Shell entry point
├── tl-wrap.js           # Main wrapper with external tools (split2, strip-ansi)
└── lib/                 # Supporting modules
    ├── state-tracker.js # Pattern detection using industry-standard libraries
    └── http-client.js   # API communication
```

## Code Patterns & Conventions

### Code Style
- Avoid unnecessary comments - prefer self-documenting code
- Remove existing comments that don't add value or explain complex logic
- Only add comments for complex business logic or non-obvious behavior
- **Prefer external tools** over custom implementations (e.g., `strip-ansi` vs custom regex, `split2` vs custom line buffering)

### React Patterns

**Custom Hook Structure:**
```typescript
export function useCustomHook() {
  const [state, setState] = useState(initialValue);
  
  const asyncAction = useCallback(async () => {
    try {
      const result = await invoke("tauri_command", { params });
      setState(result);
    } catch (error) {
      console.error("Action failed:", error);
    }
  }, [dependencies]);

  return { state, asyncAction };
}
```

**Component Error Boundaries:**
```typescript
// Wrap async operations in try-catch
const handleAction = useCallback(async () => {
  try {
    await performAction();
  } catch (error) {
    console.error("Action failed:", error);
    // Show user-friendly error state
  }
}, []);
```

### Rust Patterns

**Command Structure:**
```rust
#[tauri::command]
async fn command_name(app: AppHandle, param: Type) -> Result<ReturnType, String> {
    // Input validation
    // Business logic
    // Error handling with descriptive messages
    Ok(result)
}
```

**Error Handling:**
```rust
.map_err(|e| format!("Descriptive error context: {}", e))?
```

### CSS Architecture

**CSS Variables for Theming:**
```css
:root {
  --accent-primary: #818cf8;
  --bg-primary: #0f0f23;
  --text-primary: #e2e8f0;
  --transition-base: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Component-Scoped Classes:**
```css
.component-name {
  /* Base styles */
}

.component-name.modifier {
  /* State variations */
}

.component-name .element {
  /* Child elements */
}
```

## Security & Permissions

### Tauri v2 Capabilities

**Required Permissions:**
```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "core:default",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-visible-on-all-workspaces",
    "shell:allow-execute",
    "notification:default"
  ]
}
```

**Security Principles:**
- Localhost-only HTTP server (127.0.0.1:4317)
- No external network access required
- Minimal metadata collection (no code content)
- File system access limited to app data directory

## Performance Considerations

### Optimization Strategies

**React:**
- `useMemo` for expensive computations (task filtering)
- `useCallback` for stable function references
- Component lazy loading for setup wizard

**Rust:**
- In-memory state for fast access
- Minimal JSON serialization
- HTTP connection pooling

**Memory Management:**
- Task cleanup with countdown removal
- Bounded state history (prevent memory leaks)
- Efficient string handling for large outputs

### Bundle Size
- Tree shaking for unused React components
- Selective Tauri feature compilation
- Optimized icon assets

## Troubleshooting

### Common Issues

**State Not Updating:**
- Check Tauri event listeners are properly set up
- Verify HTTP server is running on port 4317
- Ensure CLI wrapper has correct gateway URL

**Window Behavior:**
- macOS permissions for automation may be needed
- Check always-on-top permissions in capabilities
- Verify window API calls are properly awaited

**CLI Integration:**
- PATH issues: ensure `/usr/local/bin` is in PATH
- PTY compatibility: verify terminal emulation is working
- Process cleanup: ensure spawned processes are properly managed

### Debug Tools

**React DevTools:** Component state inspection
**Tauri DevTools:** Native API debugging  
**Network Panel:** HTTP gateway communication
**Console Logs:** Rust server output and errors

## Contributing Guidelines

### Code Quality
- Use TypeScript strict mode
- Follow React hooks patterns
- Implement proper error handling
- Write descriptive commit messages

### Testing Approach
- Manual testing with real CLI tools
- Integration testing with curl commands
- Cross-platform compatibility checks
- Performance testing with multiple sessions

### Documentation
- Update CLAUDE.md for implementation changes
- Keep README.md current for user features
- Document breaking changes in PRD.md
- Add inline comments for complex logic

---

This guide covers the core implementation patterns for Tallor. For questions or contributions, refer to the codebase structure and existing patterns as examples.