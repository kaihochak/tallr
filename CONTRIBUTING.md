# Contributing to Tallr

Thank you for your interest in contributing to Tallr! We welcome contributions from the community and are excited to work with you.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **macOS 13+** (required for Tauri v2)
- **Node.js 20.19+** - [Download from nodejs.org](https://nodejs.org/)
- **Rust + Cargo** - Install via [rustup.rs](https://rustup.rs/)
- **Xcode Command Line Tools** - Run `xcode-select --install`

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/kaihochak/tallr.git
   cd tallr
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start the development server**:
   ```bash
   npm run tauri:dev
   ```

5. **Verify the CLI wrapper works**:
   ```bash
   ./tools/tallr claude
   ```
   This uses the local development version (no global installation needed).

## Development Workflow

### What Updates During Development

| Component | Command | Updates Automatically? |
|-----------|---------|------------------------|
| Frontend (React) | `npm run tauri:dev` | ✅ Hot reload |
| Backend (Rust) | `npm run tauri:dev` | ✅ Auto rebuild |
| CLI Wrapper (Node.js) | `./tools/tallr` | ✅ Uses local code |
| CLI Wrapper (Node.js) | `tallr` | ❌ Last prod build |

**Key Points:**
- Always use `./tools/tallr claude` for testing CLI changes (not `tallr`)
- Both connect to port 4317 - whichever server is running (dev/prod)
- Console output in CLI gets overwritten by Claude's UI - check log files instead

### Making Changes

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards
3. **Test thoroughly** - ensure all functionality works
4. **Commit with descriptive messages**:
   ```bash
   git commit -m "feat: add support for new AI tool integration"
   ```

### Testing Your Changes

- **Frontend**: Changes appear with hot reload at `http://localhost:1420`
- **Backend**: Rust recompiles automatically with Tauri dev server
- **CLI Wrapper**: Test directly with `./tools/tallr claude`
- **Manual Testing**: Test state detection with example scripts:
  ```bash
  ./tools/tallr bash ./tools/examples/test-waiting-user.sh  # Tests PENDING state
  ./tools/tallr bash ./tools/examples/test-error.sh        # Tests ERROR state  
  ./tools/tallr bash ./tools/examples/test-success.sh      # Tests WORKING→DONE
  ```

- **State Detection Reference**: Understanding how states are triggered:

  | System | PENDING | WORKING | IDLE | DONE | ERROR | CANCELLED |
  |--------|---------|---------|------|------|-------|-----------|
  | **Claude (patterns)** | `❯ 1.` | `esc to interrupt` | No patterns | Exit code 0 | Exit code ≠ 0 | Ctrl+C |
  | **Claude (hooks)** | Notification hook | null | Stop hook | Exit code 0 | Exit code ≠ 0 | Ctrl+C |
  | **Codex** | `▌` | `esc to interrupt` | No patterns | Exit code 0 | Exit code ≠ 0 | Ctrl+C |
  | **Gemini** | `● 1. Yes` | `esc to cancel` | No patterns | Exit code 0 | Exit code ≠ 0 | Ctrl+C |

  **Detection Priority**: PENDING → WORKING → IDLE (default)

- **Reset Setup Wizard** (complete reset):
   ```bash
   # Remove existing CLI symlink (if it exists)
   sudo rm -f /usr/local/bin/tallr
   
   # Remove setup completion flag
   rm -f ~/Library/Application\ Support/Tallr/.setup_completed
   
   # Remove settings (dev build)
   rm -f ~/Library/Application\ Support/dev.tallr.app/settings.json
   
   # OR for production build
   rm -f ~/Library/Application\ Support/com.tallr.app/settings.json
   
   # Restart the app
   npm run tauri:dev
   ```

### Debugging & Logging

- **Enable debug logging**:
  ```bash
  # CLI wrapper verbose output
  DEBUG=tallr ./tools/tallr claude
  
  # Rust backend verbose output
  RUST_LOG=debug npm run tauri:dev
  ```

- **Log files** (always created, more verbose with debug flags):
  - Rust backend: `~/Library/Application Support/Tallr/logs/tallr.log`
  - CLI wrapper: `~/Library/Application Support/Tallr/logs/cli-wrapper.log`
  
- **Watch logs in real-time** (doesn't interfere with CLI):
  ```bash
  # See all logs with formatting
  tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq '.'
  
  # Filter by namespace (e.g., state changes only)
  tail -f "$HOME/Library/Application Support/Tallr/logs/cli-wrapper.log" | jq 'select(.namespace == "tallr:state")'
  ```

- **Adding logging to new code**:
  ```typescript
  // Frontend
  import { logger } from '@/utils/logger';
  logger.info('User action', { context });
  
  // Rust
  use log::{info, error};
  info!("Operation completed");
  
  // CLI wrapper
  import { debug } from './lib/debug.js';
  debug.api('API call', { endpoint });
  ```

### Code Quality

- **Linting**: Run `npm run lint` (if available)
- **Type Checking**: Ensure TypeScript strict mode compliance
- **Build Verification**: Run `npm run tauri:build` to verify production builds
- **Security**: Never commit secrets, API keys, or personal information

## Coding Standards

### General Guidelines

- **Clear Naming**: Prefer descriptive variable and function names
- **Minimal Comments**: Write self-documenting code; add comments only for complex logic
- **External Tools**: Use established libraries over custom implementations
- **Consistency**: Follow existing patterns in the codebase

### TypeScript/React

- Use TypeScript strict mode
- Follow React hooks patterns
- Implement proper error handling
- Use existing custom hooks (`useAppState`, `useSettings`)

### Rust

- Follow standard Rust conventions
- Use proper error handling with descriptive messages
- Keep functions focused and modular
- Document public APIs

### File Organization

```
src/                     # React frontend
├── components/          # UI components
├── hooks/              # Custom hooks
├── services/           # API and external services
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/lib.rs          # Main application logic
└── capabilities/       # Tauri security permissions

tools/                  # CLI wrapper
├── tallr               # Main entry point
├── tl-wrap.js          # Core wrapper logic
└── lib/                # Supporting modules
```

## Bug Reports

When reporting bugs, please include:

- **Environment**: macOS version, Node.js version, Rust version
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Log output** if available (use `DEBUG=1 ./tools/tallr claude`)
- **Screenshots** if the issue is visual

Use our [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when available.

## Feature Requests

For new features:

- **Check existing issues** to avoid duplicates
- **Describe the problem** the feature would solve
- **Propose a solution** with implementation details if possible
- **Consider alternatives** and explain why your approach is preferred

## Security

- **Never commit** API keys, tokens, or personal information
- **Use environment variables** for configuration
- **Follow Tauri security best practices**
- **Report security vulnerabilities** via our [Security Policy](SECURITY.md)

## Pull Request Process

1. **Ensure your PR**:
   - Has a clear description of changes
   - References related issues (e.g., "Fixes #123")
   - Includes tests if applicable
   - Passes all checks

2. **PR Guidelines**:
   - Keep changes focused and atomic
   - Use conventional commit messages
   - Update documentation if needed
   - Ensure backward compatibility

3. **Review Process**:
   - Maintainers will review your PR
   - Address feedback promptly
   - Be open to suggestions and changes

## Community

- **Be respectful** and inclusive
- **Help others** in issues and discussions
- **Share knowledge** and learnings
- **Follow our** [Code of Conduct](CODE_OF_CONDUCT.md)

## Additional Resources

- **Architecture Guide**: See [CLAUDE.md](CLAUDE.md) for implementation details
- **API Documentation**: Check README.md for HTTP gateway API
- **Tauri Documentation**: [tauri.app](https://tauri.app/)
- **Debugging**: Use browser dev tools (Cmd+Option+I) for frontend issues

## Good First Issues

Look for issues labeled `good first issue` or `help wanted` to get started. These are specifically chosen to be approachable for new contributors.

## Questions?

- **General Discussion**: Open a GitHub discussion
- **Technical Questions**: Comment on relevant issues
- **Direct Contact**: Reach out to maintainers

---