# Tally Development Guide (Tauri v2 + React 19)

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

When you first launch the app, macOS will prompt for permissions:

### 1. Notifications Permission
- **Prompt**: "Tally would like to send you notifications"
- **Action**: Click **"Allow"**
- **Why**: Required for WAITING_USER/ERROR alerts (Tauri v2 notification plugin)

### 2. Shell Commands Permission
- **Prompt**: "Tally would like to run shell commands"
- **Action**: Click **"Allow"**
- **Why**: Required for opening IDEs and terminal (Tauri v2 shell plugin)

### 3. Automation Permission (if prompted)
- **Prompt**: "Tally would like to control Terminal.app"
- **Action**: Open **System Preferences** → **Privacy & Security** → **Automation** → Enable **Tally** for **Terminal**
- **Why**: Required for opening terminal tabs in project directories

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

## Testing the Modern Stack

### 1. Basic Functionality Test
```bash
# Launch the app (should see floating window + system tray icon)
npm run tauri:dev
```

**Expected Modern Features:**
- Tauri v2 native window with enhanced performance
- System tray with Tauri v2 tray plugin
- React 19 rendering with improved concurrency

### 2. Test Modern HTTP Gateway (Axum 0.8)
```bash
export TALLY_TOKEN=devtoken

# Test new Axum 0.8 error handling
curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project":{"name":"test","repoPath":"/tmp"},"task":{"id":"test-1","agent":"claude","title":"Test","state":"WAITING_USER"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

**Expected Results:**
- Improved error messages from Axum 0.8
- Desktop notification via Tauri v2 notification plugin
- Real-time updates via Tauri v2 event system

### 3. Test Modern Shell Integration
```bash
# Test Tauri v2 shell plugin commands
# Click any task in the window to trigger:
# - IDE opening via shell plugin
# - Terminal automation via shell plugin
```

### 4. Test React 19 Features
- **Enhanced Concurrency**: UI remains responsive during heavy operations
- **Better Form Handling**: If using form actions
- **Improved Error Boundaries**: Better error handling and recovery

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