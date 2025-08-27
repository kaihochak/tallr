# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React 19 + TypeScript app (components, UI, state, utils). Path alias: `@/*` → `src/*`.
- `src-tauri/`: Tauri v2 Rust backend, window/config (`tauri.conf.json`), capabilities (`capabilities/`).
- `public/`: Static assets served by Vite.
- `dist/`: Production build output consumed by Tauri in release builds.
- Key files: `vite.config.ts` (Vite/Tailwind), `tsconfig.json` (strict TS, path alias).

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server for the web UI.
- `npm run tauri:dev`: Run the full desktop app (Vite + Tauri dev).
- `npm run build`: Type-check and bundle the web app into `dist/`.
- `npm run tauri:build`: Build the packaged desktop app.
- `npm run preview`: Preview the production bundle locally.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode), React JSX runtime, Tailwind CSS utility-first.
- Indentation/formatting: 2 spaces; keep imports sorted and use the `@/` alias.
- Components: PascalCase filenames in `src/components` (e.g., `UnifiedToolbar.tsx`).
- Variables/functions: `camelCase`. Hooks prefixed with `use*` (e.g., `useSomething.ts`).
- Avoid broad refactors in feature PRs; keep changes minimal and localized.

## Testing Guidelines
- No formal test runner configured. Prefer small, easily verifiable changes.
- Manual checks: `npm run tauri:dev` to validate native behaviors (window drag, menus, notifications).
- If adding tests, mirror existing structure and propose Vitest + React Testing Library in a separate PR.

## Commit & Pull Request Guidelines
- Commits: Short, imperative subject; scope-specific (e.g., `toolbar: start drag on movement`).
- PRs must include: summary, rationale, screenshots/GIFs for UI changes, and a test plan (exact commands and steps).
- Link related issues. Avoid unrelated formatting changes. Note any capability or config updates in `src-tauri/`.

## Security & Configuration Tips
- Capabilities are least-privilege in `src-tauri/capabilities/`. Only add permissions you need (e.g., `core:window:*`).
- Keep CSP in `tauri.conf.json` tight; justify any relaxations.
- Validate window options (`decorations`, `titleBarStyle`) alongside frontend drag/maximize logic when changing the toolbar.
