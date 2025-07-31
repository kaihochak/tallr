# Tally Development Guide

## Prerequisites

Before you begin, ensure you have the following installed on macOS:

### Required Software
- **macOS 13+** (required for Tauri)
- **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/)
- **Rust + Cargo** - Install via [rustup.rs](https://rustup.rs/)
- **Xcode Command Line Tools** - Install with `xcode-select --install`

### Verify Installation
```bash
# Check versions
node --version    # Should be 18+
npm --version     # Should be 8+
rustc --version   # Should be 1.70+
cargo --version   # Should be 1.70+
```

## Setup & Installation

### 1. Clone/Navigate to Project
```bash
cd /Users/kai/Development/tally
```

### 2. Install Dependencies
```bash
# Install npm dependencies
npm install

# This installs:
# - @tauri-apps/api (for frontend-backend communication)
# - React + TypeScript
# - Vite (dev server and bundler)
# - @vitejs/plugin-react
```

### 3. Build Rust Dependencies (First Time)
```bash
cd src-tauri
cargo build
cd ..
```

## Development Workflow

### Option A: Two Terminal Setup (Recommended)

**Terminal 1: Frontend Dev Server**
```bash
npm run dev
```
This starts Vite at `http://localhost:5173` with hot reload.

**Terminal 2: Tauri App**
```bash
cd src-tauri
cargo tauri dev
```
This compiles Rust and launches the native app.

### Option B: Single Command (Advanced)
```bash
# From project root
cd src-tauri && cargo tauri dev
```
This will automatically start the Vite dev server and then launch the app.

## First Run Setup

When you first launch the app, macOS will prompt for permissions:

### 1. Notifications Permission
- **Prompt**: "Tally would like to send you notifications"
- **Action**: Click **"Allow"**
- **Why**: Required for WAITING_USER/ERROR alerts

### 2. Automation Permission
- **Prompt**: "Tally would like to control Terminal.app"
- **Action**: Click **"OK"** → Open **System Preferences** → **Privacy & Security** → **Automation** → Enable **Tally** for **Terminal**
- **Why**: Required for opening terminal tabs in project directories

### 3. Accessibility (If Prompted)
- Some macOS versions may request accessibility permissions
- **Action**: System Preferences → Privacy & Security → Accessibility → Add Tally

## Development Features

### Hot Reload
- **Frontend**: Changes to `src/` files auto-reload in the window
- **Backend**: Changes to `src-tauri/src/` files trigger Rust recompilation (takes 10-30s)

### Debug Tools
- **Frontend Console**: `Cmd+Option+I` in the app window
- **Rust Logs**: Check the terminal where you ran `cargo tauri dev`
- **Network**: All HTTP traffic goes to `127.0.0.1:4317`

### File Structure
```
tally/
├── src/                    # React frontend
│   ├── App.tsx            # Main UI component
│   └── main.tsx           # React entry point
├── src-tauri/             # Rust backend
│   ├── src/main.rs        # Main Rust application
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── tools/
│   ├── tl-wrap.js         # CLI wrapper script
│   └── examples/          # Test scripts
└── package.json           # Node dependencies
```

## Testing the App

### 1. Basic Functionality Test
```bash
# Open the app (should see floating window + system tray icon)
# Window should show "No active tasks" initially
```

### 2. Test HTTP Gateway
```bash
export TALLY_TOKEN=devtoken

# Create a test task
./tools/examples/post-waiting.sh
```

**Expected Results:**
- Desktop notification appears
- Task shows in the window
- System tray tooltip changes to "Tally - Waiting for user"
- Window updates within 2 seconds

### 3. Test Jump-to-Context
```bash
# Click any task in the window
```

**Expected Results:**
- Cursor/VS Code opens in the project directory
- Terminal opens new tab and `cd`s to project directory

### 4. Test Keyboard Shortcuts
- Press `⌘K` → Search bar should highlight in blue
- Use `↑↓` arrows → Tasks should highlight with blue border
- Press `Enter` → Should jump to selected task

### 5. Test Timers
- Click **25m** or **45m** button on any task
- Timer should start counting up in format `MM:SS`
- Click **Stop** to pause, **Reset** to clear

### 6. Complete Task Test
```bash
./tools/examples/complete-task.sh
```

**Expected Results:**
- Task state changes to "DONE" with green badge
- System tray tooltip returns to "Tally"

## Troubleshooting

### App Won't Start
```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clean Rust build
cd src-tauri
cargo clean
cargo build
```

### Permissions Issues
```bash
# Reset macOS permissions (requires restart)
sudo tccutil reset All dev.tally.app
```

### Gateway Not Responding
```bash
# Check if port is in use
lsof -i :4317

# Test gateway directly
curl http://127.0.0.1:4317/health
```

### IDE/Terminal Not Opening
- Ensure Cursor or VS Code is installed and in PATH
- Test manually: `cursor --help` or `code --help`
- Check Automation permissions in System Preferences

### No Notifications
- Check System Preferences → Notifications → Tally
- Ensure "Allow Notifications" is enabled
- Try creating a WAITING_USER task again

## Development Tips

### Live Editing
- Edit `src/App.tsx` to see UI changes instantly
- Edit `src-tauri/src/main.rs` for backend changes (slower compile)

### Debugging Rust
```bash
# Add debug prints
println!("Debug: {:#?}", some_variable);

# Check logs in terminal where you ran cargo tauri dev
```

### Debugging React
- Use `console.log()` in `src/App.tsx`
- Open dev tools with `Cmd+Option+I`
- Check the Console tab

### Testing HTTP API
```bash
# Custom test requests
curl -H "Authorization: Bearer devtoken" \
     -H "Content-Type: application/json" \
     -d '{"taskId":"test-1","state":"ERROR","details":"Something failed"}' \
     http://127.0.0.1:4317/v1/tasks/state
```

### Data Persistence
- App data: `~/Library/Application Support/Tally/snapshot.json`
- Dev snapshot: `./snapshot.json` (created during development)

## Building for Production

```bash
# Build the app bundle
cd src-tauri
cargo tauri build

# Output will be in:
# src-tauri/target/release/bundle/macos/Tally.app
```

## Environment Variables

```bash
# Required for gateway authentication
export TALLY_TOKEN=devtoken

# Optional: For Claude CLI wrapper
export TL_PROJECT="my-project"
export TL_REPO="/path/to/project"
export TL_AGENT="claude"
export TL_TITLE="Task description"
```

## Port Configuration

- **Vite Dev Server**: `http://localhost:5173`
- **HTTP Gateway**: `http://127.0.0.1:4317`
- **Gateway Endpoints**:
  - `POST /v1/tasks/upsert` - Create/update tasks
  - `POST /v1/tasks/state` - Update task state
  - `POST /v1/tasks/done` - Mark task complete

## Common Development Scenarios

### Scenario 1: Adding a New Feature
1. Make changes to `src/App.tsx` for UI
2. Add Tauri commands in `src-tauri/src/main.rs` if needed
3. Test with the example scripts
4. Update types if adding new data fields

### Scenario 2: Debugging Notifications
1. Check browser console for JavaScript errors
2. Check Rust terminal for backend errors
3. Verify macOS notification permissions
4. Test with `post-waiting.sh` script

### Scenario 3: Testing Jump-to-Context
1. Ensure Cursor/VS Code is installed and in PATH
2. Create a test project directory
3. Use real project path in test scripts
4. Check macOS Automation permissions

### Scenario 4: Performance Issues
1. Monitor Rust terminal for compilation times
2. Use browser dev tools to check React renders
3. Check if polling is disabled (should use events)
4. Verify timer intervals aren't causing excessive re-renders

## Architecture Notes

### Frontend → Backend Communication
- Uses Tauri's `invoke()` for commands
- Uses Tauri's `listen()` for real-time events
- No direct HTTP calls from frontend to backend

### Backend → Frontend Communication
- HTTP gateway receives external requests
- State changes emit Tauri events
- Frontend subscribes to `state-update` events

### State Management
- Backend: In-memory HashMap + JSON persistence
- Frontend: React useState with real-time sync
- No external state management library needed

The development setup provides hot reload, debug tools, and a complete testing environment for the Tally MVP.