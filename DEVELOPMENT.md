# Tally Development Guide (Tauri v2 + React 19)

## Core MVP Focus

Tally is a lightweight tool that tracks your AI CLI sessions (Claude, Gemini) and notifies you when they need input. This guide focuses on the essential features needed for a working MVP.

### Four Core Use Cases
1. **Track Claude Sessions** - Automatically track when you run `claude` in any project
2. **Get Notified** - Hybrid notifications when Claude needs your input
3. **See All Sessions** - Floating window shows all active sessions at a glance
4. **Resume After Breaks** - Sessions persist across app restarts

## Prerequisites

Before you begin, ensure you have the following installed on macOS:

### Required Software
- **macOS 13+** (required for Tauri v2)
- **Node.js 20.19+** - [Download from nodejs.org](https://nodejs.org/) *(Updated requirement for Vite 7)*
- **Rust + Cargo** - Install via [rustup.rs](https://rustup.rs/)
- **Xcode Command Line Tools** - Install with `xcode-select --install`

### Verify Installation
```bash
# Check versions
node --version     # Should be 20.19+
npm --version      # Should be 10+
rustc --version    # Should be 1.70+
cargo --version    # Should be 1.70+
```

## Setup & Installation

### 1. Install Dependencies
```bash
cd /Users/kai/Development/tally
npm install

# This installs modern versions:
# - React 19.0.0 (Server Actions, React Compiler)
# - Vite 7.0.6 (Rolldown bundler)
# - @tauri-apps/api v2.1.1 (Tauri v2 APIs)
# - TypeScript 5.7.2
```

### 2. Development Server (Single Command)
```bash
# Run both frontend and backend together
npm run tauri:dev
```

**What this does:**
1. Starts Vite 7 dev server at `http://localhost:1420`
2. Compiles Rust backend with Axum 0.8 
3. Launches native macOS app with hot reload
4. Starts HTTP gateway at `http://127.0.0.1:4317`

## First Run Setup

When you first launch the app (both development and production), you'll see:

### 1. Setup Wizard
On first launch, Tally shows a setup wizard:
- **Install CLI Tools Button**: Click to automatically install the `tally` command
- **Permission Check**: App checks if it has write access to `/usr/local/bin`
- **Manual Fallback**: If automatic installation fails, copy the manual command:
  ```bash
  sudo ln -s /Applications/Tally.app/Contents/MacOS/tally /usr/local/bin/tally
  ```
- **Skip Option**: You can skip setup and install later

### 2. macOS Permissions
macOS will prompt for permissions:
- **Notifications**: "Tally would like to send you notifications" → Click **"Allow"**
- **Shell Commands**: "Tally would like to run shell commands" → Click **"Allow"**
- **Automation** (if prompted): Enable Tally for Terminal in System Preferences

### 3. Testing the Tally CLI Wrapper

After launching Tally app, you can test session tracking:

**Step 1: Start Tally app**
```bash
npm run tauri:dev
# Wait for app window to appear and HTTP gateway to start on :4317
```

**Step 2: Install the CLI tools (if not done in setup wizard)**
```bash
# Option A: Use the setup wizard in the app
# Click "Install CLI Tools" button

# Option B: Manual installation
sudo ln -s /Applications/Tally.app/Contents/MacOS/tally /usr/local/bin/tally

# Option C: For development testing, use the local wrapper
cd /Users/kai/Development/tally
./tools/tally claude --help              # Test basic command pass-through
```

**Step 3: Use the tally CLI wrapper**
```bash
# After installation, from any directory:
tally claude                              # Start a Claude session
tally claude --help                       # Test basic command pass-through
tally echo "Approve? [y/N]"              # Test waiting user detection
tally sh -c "echo 'Error: failed' && exit 1"  # Test error detection
```

**Step 3: Environment variables (optional)**
```bash
export TALLY_TOKEN=devtoken     # Optional authentication
export TL_IDE=cursor           # Preferred IDE (cursor or vscode)
./tools/tally claude
```

**What You Should See:**
1. Task appears in Tally window immediately when command starts
2. Mac notification appears when "Approve? [y/N]" is detected
3. Task state changes to WAITING_USER in the dashboard
4. Task state changes to ERROR if command fails
5. Click task row to jump to IDE + Terminal at project location

> **Why manual wrapper?** Eliminates complex shell setup while keeping all core functionality. Users just run `tally claude` instead of `claude`.

## Modern Development Features

### Hot Reload (Enhanced)
- **Frontend**: React 19 + Vite 7 provide instant updates (< 100ms)
- **Backend**: Rust changes trigger fast recompilation with Tauri v2
- **Rolldown**: Vite 7's new bundler reduces memory usage by 100x

### Debug Tools
- **Frontend Console**: `Cmd+Option+I` in the app window
- **Rust Logs**: Check the terminal where you ran `npm run tauri:dev`
- **Network**: All HTTP traffic monitored via Axum 0.8 logs
- **Tauri DevTools**: Enhanced debugging for Tauri v2 APIs

### Modern File Structure
```
tally/
├── src/                     # React 19 frontend
│   ├── App.tsx             # Main UI component (using React 19 features)
│   ├── main.tsx            # React 19 entry point
│   └── vite-env.d.ts       # Vite 7 + TypeScript 5.7 types
├── src-tauri/              # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs          # Axum 0.8 + Tauri v2 integration
│   │   └── main.rs         # Application entry point
│   ├── capabilities/       # Tauri v2 capabilities (replaces allowlist)
│   │   └── default.json    # Shell, notification permissions
│   ├── Cargo.toml          # Modern Rust dependencies
│   └── tauri.conf.json     # Tauri v2 configuration format
├── tools/
│   ├── tl-wrap.js          # CLI wrapper script
│   └── examples/           # Test scripts
├── package.json            # Modern Node dependencies
├── vite.config.ts          # Vite 7 configuration
└── tsconfig.json           # TypeScript 5.7 configuration
```

## Notification System (Hybrid Approach)

Tally uses a hybrid notification system that combines Mac native notifications with visual indicators in the app:

### 1. Mac Native Notifications (✅ Implemented)
- Uses Tauri v2 notification plugin
- Appears as standard Mac notification banner (top-right)
- Triggered on `WAITING_USER` and `ERROR` states
- Clickable to jump to terminal

### 2. Visual Indicators (🚧 To Implement)
**In Tally Window:**
- Task rows pulse amber when `WAITING_USER`
- Error tasks show red indicator
- Window title shows "⚠️ Needs Input" when any task waiting

**System Tray:**
- Icon color reflects aggregate state:
  - Green: All tasks running normally
  - Amber: At least one task waiting for user
  - Red: At least one task in error state

**Implementation Notes:**
- Visual indicators require only CSS animations (pulsing effect)
- System tray color change needs state checking logic
- No new APIs required - uses existing task state

### 3. Why Hybrid Works Best
- **Mac notifications**: Immediate alert even when Tally is minimized
- **Visual indicators**: Persistent visibility until you take action
- **Low effort**: Leverages existing notification system + simple CSS

## Testing the Core Features

### 1. Basic Functionality Test
```bash
# Launch the app (should see floating window + system tray icon)
npm run tauri:dev
```

**Expected Features:**
- Floating window with task list
- System tray icon
- Real-time task updates

### 2. Test HTTP Gateway & Notifications
```bash
export TALLY_TOKEN=devtoken

# Test notification trigger
curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project":{"name":"test","repoPath":"'$(pwd)'"},"task":{"id":"test-1","agent":"claude","title":"Test","state":"WAITING_USER","details":"Approve? [y/N]"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

**Expected Results:**
- Mac desktop notification appears
- Task appears in window with WAITING_USER state
- Real-time updates in UI

### 3. Test Context Jumping
```bash
# Click any task in the window to trigger:
# - IDE opening (Cursor/VS Code with --reuse-window)
# - Terminal automation (opens Terminal.app at project directory)
```

## Troubleshooting (Modern Stack)

### Vite 7 Issues
```bash
# Clear Vite 7 cache
rm -rf node_modules/.vite
npm install

# Check Rolldown bundler
npm run build  # Should use Rolldown instead of Rollup
```

### Tauri v2 Issues
```bash
# Clear Tauri v2 build cache
cd src-tauri
cargo clean
cargo build

# Check capabilities
cat src-tauri/capabilities/default.json
```

### React 19 Issues
```bash
# Check React 19 compatibility
npm list react react-dom

# Should show:
# react@19.0.0
# react-dom@19.0.0
```

### Axum 0.8 Gateway Issues
```bash
# Test gateway directly
curl http://127.0.0.1:4317/v1/state

# Check Axum logs in terminal for better error messages
```

## Modern Development Workflows

### Workflow 1: Frontend Development
```bash
# Start dev server with hot reload
npm run tauri:dev

# Edit src/App.tsx - changes appear instantly with Vite 7
# React 19 provides better dev experience with enhanced error boundaries
```

### Workflow 2: Backend Development  
```bash
# Edit src-tauri/src/lib.rs
# Axum 0.8 provides better compile-time error messages
# Tauri v2 offers improved debugging and logging
```

### Workflow 3: API Development
```bash
# Test endpoints with modern Axum 0.8 features
# Enhanced JSON handling and error responses
# Better async/await patterns
```

## Performance Characteristics (Modern Stack)

### Build Performance
- **Vite 7 + Rolldown**: 100x memory reduction during builds
- **Tauri v2**: Faster compilation and smaller bundle sizes
- **React 19**: Improved build-time optimizations

### Runtime Performance
- **React 19**: Enhanced concurrent rendering
- **Axum 0.8**: Improved async performance and lower latency
- **Tauri v2**: Better native integration and resource usage

### Memory Usage
- **Target**: ≤ 150MB idle (improved from previous target)
- **Vite 7**: Dramatically reduced memory during development
- **React 19**: Better memory management with concurrent features

## Current Implementation Status

### ✅ What's Working
- **Setup Wizard**: Button-first CLI installation with permission checking
- **HTTP Gateway**: All endpoints implemented (upsert, state, done)
- **Real-time Updates**: Event system for UI updates
- **Mac Notifications**: Desktop alerts on WAITING_USER/ERROR
- **Frontend Dashboard**: Search, filtering, keyboard shortcuts
- **IDE Integration**: Commands to open Cursor/VS Code
- **Terminal Automation**: AppleScript for Terminal.app
- **CLI Wrapper**: Simple `tally` command entry point created

### 🚧 Critical Missing Features
1. **Persistent Storage**: No JSON file saving (data lost on restart)
2. **Project Deduplication**: Creates new project for each task
3. **Visual Indicators**: No pulsing/highlighting for waiting tasks
4. **Installation Verification**: No test to verify CLI works after installation

### 📝 Implementation Priority
1. **Add JSON persistence** - Save to `~/Library/Application Support/Tally/`
2. **Fix project deduplication** - Reuse existing projects by path
3. **Add visual indicators** - CSS for pulsing amber rows
4. **Installation verification** - Test CLI works after setup
5. **Complete system tray** - Color changes and menu

## Future Enhancements (Deferred)

These features are moved to future iterations to keep the MVP focused:

- **Shell Integration**: Automatic shell function installation (complex setup)
- **Project Timers**: Pomodoro-style timeboxing with alerts
- **GitHub Integration**: Display GitHub URLs and repo info  
- **Multiple IDE Support**: User preferences for different IDEs per project
- **Advanced Search**: Complex filtering and project history
- **Team Features**: Sharing tasks or project status
- **Cloud Sync**: Backup/restore across machines
- **Windows/Linux**: Cross-platform support
- **MCP Integration**: Model Context Protocol server support

## Configuration Updates

### Tauri v2 Configuration (`tauri.conf.json`)
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tally",
  "identifier": "dev.tally.app",
  "plugins": {
    "shell": {
      "open": true,
      "scope": [...]
    },
    "notification": {
      "all": true
    }
  }
}
```

### Capabilities (`src-tauri/capabilities/default.json`)
```json
{
  "identifier": "default",
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "notification:allow-send",
    "event:default"
  ]
}
```

### Modern Dependencies

**Frontend:**
- React 19.0.0 (Server Actions, React Compiler)
- Vite 7.0.6 (Rolldown bundler)
- TypeScript 5.7.2 (latest stable)

**Backend:**
- Tauri v2.1.1 (plugin architecture)
- Axum 0.8 (modern async framework)  
- Tokio 1.x (latest async runtime)

## Migration Notes

If you're familiar with the previous Tauri v1 implementation:

### Key Changes
- **Configuration**: New `tauri.conf.json` format for v2
- **Plugins**: Shell and notifications are now plugins
- **Capabilities**: Replace allowlist with fine-grained permissions
- **APIs**: Updated import paths for Tauri v2
- **Build**: Vite 7 with Rolldown instead of Rollup

### Breaking Changes Handled
- ✅ Path parameter syntax updated for Axum 0.8
- ✅ Event system migrated to Tauri v2 patterns
- ✅ Notification system using v2 plugin
- ✅ Shell commands via v2 plugin architecture

The modern stack provides significant improvements in performance, developer experience, and maintainability while preserving all original MVP functionality.