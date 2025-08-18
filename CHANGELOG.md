# Changelog

All notable changes to Tallr will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open source release
- Core session tracking functionality for AI CLI tools
- Support for Claude, Gemini, Aider, and other AI assistants
- Real-time desktop notifications for session state changes
- Tally view mode for minimal, unobtrusive monitoring
- Always-on-top window option with workspace following
- HTTP gateway for CLI-to-desktop communication
- Automatic IDE detection and project opening
- Custom IDE mapping support via `tallr-ide` utility
- Session history with 5-minute retention
- Task state tracking (Idle, Pending, Working, Done, Error)
- Cross-platform support (macOS, Linux, Windows)
- CLI wrapper with PTY support for proper terminal emulation
- Secure token-based authentication
- Debug mode for development and troubleshooting

### Security
- Local-only HTTP server (127.0.0.1:4317)
- Bearer token authentication for API endpoints
- No external network connections
- All data stored locally

## [0.1.0] - 2025-08-18

### Added
- First public release
- Comprehensive documentation
- Contributing guidelines
- Security policy
- MIT License

### Changed
- Improved error handling and user feedback
- Enhanced CLI detection patterns
- Optimized bundle size and performance
- Refined UI animations and transitions

### Fixed
- Window positioning on multi-monitor setups
- Session cleanup after completion

### Known Issues
- Notification permissions may need manual approval on first run
- Some terminal emulators may not fully support PTY mode
- IDE detection relies on parent process, which may vary by system

## Development History

### Pre-Release Development
- 2025-08-01: Project inception and initial prototype
- 2025-08-05: Core architecture design and Tauri v2 integration
- 2025-08-08: HTTP gateway implementation and CLI wrapper development
- 2025-08-12: Multi-agent support and state tracking added
- 2025-08-15: Tally view mode introduced and UI refinements
- 2025-08-17: Documentation and open source preparation
- 2025-08-18: Initial open source release

---

For detailed commit history, see the [GitHub repository](https://github.com/kaihochak/tallr).