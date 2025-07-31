# Tally (Starter)

A minimal starter for the **Tally** 1-week MVP:
- Tauri (Rust) desktop app with system tray and a local **Axum** HTTP gateway on `127.0.0.1:4317`
- React + TypeScript panel (simple snapshot view)
- JSON persistence for a live `snapshot.json`
- Generic Node wrapper: `tools/tl-wrap.js` (Node 18+ with global `fetch`)

## Quick start (dev)

```bash
# macOS, requires: Node 18+, Rust + Cargo, Xcode Command Line Tools
cd tally-starter
npm install

# In one terminal: run Vite dev server
npm run dev

# In another terminal: run the Tauri app (uses dev server at http://localhost:5173)
cd src-tauri
cargo tauri dev
```

> First run: authorize **Notifications** and **Automation** prompts when macOS asks.

## Test the gateway

```bash
export TALLY_TOKEN=devtoken

curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"project":{"name":"course-rater","repoPath":"/Users/you/dev/course-rater","preferredIDE":"cursor"},
       "task":{"id":"t1","agent":"claude","title":"Migrate DB","state":"WAITING_USER","details":"Approve? [y/N]"}}'   http://127.0.0.1:4317/v1/tasks/upsert
```

Open the app window (tray icon → Open Window) and watch `snapshot.json` update.

## Wrapper

See `tools/tl-wrap.js` and docs `USER.md`, `CLAUDE.md`.

## Notes

- The UI currently polls `snapshot.json` every 2s. Replace with Tauri `invoke`/events when ready.
- IDE/Terminal jump code is left as a TODO — wire it to a button or notification callback next.
