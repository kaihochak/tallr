<div align="center">
  <img src="public/tallr-icon.svg" alt="Tallr Logo" width="120" height="120">
  
  # Tallr

  **AI CLI session monitoring and task management dashboard**

  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
  [![Tauri](https://img.shields.io/badge/Tauri-24C8D8?style=flat-square&logo=tauri&logoColor=fff)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=000)](https://reactjs.org/)
  [![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
</div>

---

## Overview

Tallr is an open-source tool for tracking and managing AI CLI sessions from a clean desktop dashboard.  
It detects when your AI CLI is working, waiting, or needs input so you can stay in flow without context switching.

<!-- Screenshot placeholder - add dashboard.png when available -->
<!--
![Tallr Dashboard](./screenshots/dashboard.png)
-->

---

## Install (Users)

Download the latest macOS build from the **Releases** page:

➡️ https://github.com/kaihochak/tallr/releases

Steps:
1. Download the latest `.dmg`.
2. Drag **Tallr.app** to Applications.
3. Open Tallr.

First run on macOS: if you see a Gatekeeper warning, right-click **Tallr.app** → Open → Open.

---

## Build (Developers)

**Quick Start**
```bash
npm install
npm run tauri:dev
```

For full development setup, testing, debugging, and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

- Real-time monitoring of AI CLI sessions  
- Smart notifications when attention is needed  
- Session dashboard with expandable details  
- IDE auto-detection (VS Code, Cursor, Zed, JetBrains, Windsurf, etc.)  
- Always-on-top window and keyboard shortcuts  

---

## Basic Usage

1. Open the Tallr app
2. In your terminal, run:
```bash
tallr claude    # Monitor Claude sessions
tallr gemini    # Monitor Gemini sessions  
tallr codex     # Monitor Codex sessions
```
3. Use your AI tool normally - Tallr tracks the session in real-time

The dashboard shows when your AI is working, waiting, or needs input. You'll get notifications when attention is needed.

**Supported AI tools:** Claude, Gemini, and Codex.

---

## Configuration

### IDE Detection
Tallr auto-detects your IDE, but some IDEs (like Cursor) are identified as VS Code. To use a specific IDE:

```bash
export TL_IDE=cursor  # or code, zed, webstorm
```

---

## Links

- 🐛 [Report Issues](https://github.com/kaihochak/tallr/issues)
- 💬 [Discussions](https://github.com/kaihochak/tallr/discussions)
- 🔒 [Security Policy](SECURITY.md)

---

## Contributing

Tallr started as my personal tool to improve AI development workflows. As more people use it, contributors are encouraged and very much appreciated! 

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup and requirements
- Testing and debugging workflows
- Code standards and conventions
- Pull request process

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
