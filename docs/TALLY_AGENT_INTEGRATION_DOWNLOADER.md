
# Tally Agent Integration — Downloader Version (Design Doc v1)

> **Purpose:** A single, ready-to-share doc for engineers (Claude Code, etc.) that explains the problem, goals, current vs new architecture, exact implementation steps, and a *deep feasibility review* (risks, limitations, mitigations). Use this to implement the plan.

---

## 0) Executive Summary

Tally will become an **OS-wide mission control** for coding agents. We must see *every* session (CLI or IDE), know when an agent is **waiting on the user**, notify instantly, and **jump** users back into the correct repo/IDE/terminal — **without changing user habits**.

**Core idea:** insert a **PATH shim + PTY proxy** for agent CLIs (e.g., `claude`, `gemini`) so plain commands transparently flow through Tally. For IDE agents (Cursor, Windsurf, etc.), ship a tiny **Tally IDE Bridge** that posts the same events to Tally’s local gateway. Combine **invisible sentinel markers** (when possible) with **throughput+pattern heuristics** to reliably detect `PENDING/WORKING/IDLE/ERROR`.

---

## 1) Problem Statement

- Today we only track sessions started as `tally <agent>`. Users mostly run **`claude`** or **`gemini`** directly in their own terminals → Tally **misses these sessions**.
- Our `PENDING` detection relies on **regex over terminal text**, which can be fragile as UIs change.
- There is no **global, OS-wide dashboard** across repos/terminals/IDEs; tools like Kilo handle in-editor scope, not system-wide.
- We need to unify **CLI** and **IDE** agents in one panel with the same states and notifications.

**Goals**
1. **Zero-friction capture:** users keep typing `claude`; we still see everything.
2. **Deterministic signals:** robust `WORKING/PENDING/IDLE/ERROR` with minimal false positives.
3. **Hybrid notifications + jump-back:** open **the right IDE + terminal** in the **right repo**.
4. **Persistence:** sessions survive app restarts; show history and detached sessions.
5. **Extensibility:** support non-CLI agents (Cursor, Copilot, Windsurf) via a universal event schema.

---

## 2) Scope & Non-Goals (MVP)

- **Scope (MVP):** macOS 13+, local terminals (Terminal.app, iTerm2, tmux), agent CLIs (Claude, Gemini), Cursor/VS Code jump-back, local JSON persistence.
- **Non-Goals (MVP):** Windows/Linux, cloud sync, team features, full transcript storage, IDE plugin for edits (we may add a tiny bridge later).

---

## 3) Current vs. New

| Aspect | **Current** | **New** |
|---|---|---|
| Capture | `tally <agent>` only | **PATH shim** for `claude` (and others) → capture plain invocations everywhere |
| Transport | Read terminal output from wrapper | **PTY proxy** (we own stdio, resize, signals, tee) |
| PENDING | Regex on text | **Sentinels + bytes/sec** (when possible), **regex+rate fallback** |
| Prompt UI | Best-effort | **Prompt IDs + ACK** to guarantee GUI button → correct keystroke |
| Notifications | Planned | Fire on `PENDING/ERROR`, dedupe, include last significant line |
| Persistence | Missing | `sessions.json` (append journal + compact), “Detached” on restart |
| IDE tools | Not covered | **Tally IDE Bridge** (same event schema, no scraping) |

---

## 4) Architecture

### 4.1 CLI Path (system-wide)

```
Terminal/iTerm/tmux
  └─ user types `claude`
      └─ ~/.local/bin/claude  ← Tally PATH shim
          └─ tally-pty-proxy  ← alloc PTY, pump, inject sentinels, tee stream
              └─ /usr/local/bin/claude  ← real CLI
                  ↔ Anthropic/Bedrock/Vertex

Proxy ──> Tally Gateway (localhost:4317) ──> Store(JSON) ──> Tray/Panel/Notify ──> Jump(IDE+Terminal)
```

### 4.2 IDE Path (editor-agnostic)

```
Cursor / Windsurf / (others)
  └─ Tally IDE Bridge (tiny extension/SDK)
      └─ POST same events to Tally Gateway
          → appears alongside CLI sessions in the same panel
```

---

## 5) Implementation Details

### 5.1 PATH Shim (per agent)

- Place a wrapper named **`claude`** in `~/.local/bin` (earlier than the real binary in `$PATH`).
- The shim resolves the **real** `claude` (skipping itself) and execs Tally’s **PTY proxy** which then execs the real binary inside a child PTY.

**Shim (bash concept):**
```bash
#!/usr/bin/env bash
# Find the "next" claude binary in PATH after this shim's directory
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATH_NO_SELF=$(echo "$PATH" | tr ':' '\n' | awk -v skip="$SELF_DIR" '$0!=skip' | paste -sd:)
REAL=$(PATH="$PATH_NO_SELF" command -v claude)
exec /Applications/Tally.app/Contents/MacOS/tally-pty-proxy "$REAL" "$@"
```

**Notes**
- Avoid recursion by removing the shim’s directory from `PATH` before resolving the real binary.
- Detect and warn if the user has a **shell alias/function** for `claude` (scan `.zshrc`, `.bashrc`) — aliases override PATH.

### 5.2 PTY Proxy (Rust sidecar)

Responsibilities:
- `openpty()`; spawn **real** `claude` with the PTY **slave** as its stdio; keep **master** to pump data.
- **Pump loop** (non-blocking):  
  - user stdin → PTY master (keystrokes)  
  - PTY master → user stdout (output) **and** → classifier tee
- Mirror **window size** changes (read TIOCGWINSZ from our FD; set TIOCSWINSZ on PTY; send SIGWINCH).
- Propagate **signals** (Ctrl+C, etc.) and **exit code**.

### 5.3 Classifier (priority order)

1) **Sentinels** (if we can emit them at lifecycle points):  
   - `BEGIN`, `WORKING:phase`, `PENDING:kind pid=<promptId> choices=1,2,3`, `PROMPT_ACK`, `ERROR:code`, `DONE`  
   - **Important reality check:** From a **pure proxy**, we *can reliably emit* `BEGIN/DONE/ERROR`. Emitting **exact `PENDING`** sentinels *without cooperation from the child* is not guaranteed (we don’t know when the child calls `read()`); we must use heuristics for `PENDING` unless the CLI exposes structured events or we have a cooperating wrapper.

2) **Structured/JSON mode** (if available for an agent):  
   - Prefer `--json`/automation flags; map `awaiting_user`, `choices`, `edits` directly.

3) **Heuristic fallback** (configurable per agent in `adapters.yaml`):  
   - `PENDING` when recognized prompt text (menus `❯ 1.`, `[y/N]`, “Press Enter”) **AND** bytes/sec < threshold for ≥ 250 ms.  
   - `WORKING` when verbs like `applying|writing|running tests` **AND** sustained throughput.  
   - `ERROR` on error lexicon or non-zero exit.  
   - Quiet timeout after `WORKING` → `IDLE`.

**Throughput meter:** sample bytes/sec every 100–250 ms; crucial to prevent flicker.

### 5.4 Prompt Round-trip (GUI ↔ CLI)

- When we detect `PENDING`, render buttons (e.g., *Auto*, *Manual*, *Decline*).
- On click, send mapped keystroke (`"1\r"`, `"2\r"`, `"n\r"`, `"\r"`).
- **ACK logic:**  
  - If we have a **sentinel/JSON** `PROMPT_ACK`, wait for it before flipping back to `WORKING`.  
  - If not, use a heuristic ACK: menu disappears or a new phase line appears within 1–2 s. Provide **Resend** + **Open Terminal** fallback.

### 5.5 Gateway & Store

- `POST /v1/tasks/upsert` → project (by `repoPath`) + task metadata (agent, pid, startedAt).
- `POST /v1/tasks/state` → `{ taskId, state, details, lastEventAt }`.
- `POST /v1/tasks/done` → summary (exit code, last lines).
- **Persistence:** append-only `sessions.json` with periodic compaction; maintain 8–16 KB **ring buffer** per session for “last lines” in notifications.

### 5.6 Notifications & Jump-back

- Notify on `PENDING` and `ERROR` (dedupe repeated prompts).
- Clicking:
  - **IDE**: `cursor --reuse-window .` (fallback `code --reuse-window .`).
  - **Terminal**: title/tag the child window/tab (e.g., `Tally:<taskId>`) and focus via AppleScript/iTerm2 APIs.

### 5.7 Security & Privacy

- Localhost-only gateway; optional bearer `TALLY_TOKEN`.
- **Redact secrets** in `details` (e.g., `sk-...`, `AKIA...`) before storing/sending.
- Do **not** persist raw transcripts by default.

---

## 6) IDE Agents (Cursor, Windsurf, Copilot) — Future-Proofing

### 6.1 Universal Event Schema

Unify CLI + IDE with the same messages:

```json
// Start / heartbeat
{ "source":"cursor", "sessionId":"...", "repoPath":"...", "state":"WORKING", "meta":{"ide":"cursor"} }

// Waiting on user
{ "source":"cursor", "sessionId":"...", "state":"PENDING",
  "prompt": { "id":"p-42", "kind":"menu",
    "choices":[ {"key":"1","label":"Apply automatically"},
                {"key":"2","label":"Review & apply manually"},
                {"key":"3","label":"Decline"} ] },
  "lastEventAt": 1234567890 }

// Ack / continue
{ "source":"cursor", "sessionId":"...", "event":"PROMPT_ACK", "promptId":"p-42", "selection":"2" }

// Error / Done
{ "source":"cursor", "sessionId":"...", "state":"ERROR", "details":"..." }
{ "source":"cursor", "sessionId":"...", "state":"DONE" }
```

### 6.2 Tally IDE Bridge (tiny extension/SDK)

- **For Cursor/Windsurf:** ship a minimal extension that posts these events to `http://127.0.0.1:4317`.  
- **For Copilot:** we may be limited to **presence** (on/off, waiting) unless GitHub exposes hooks. Provide an SDK for vendors/teams.

**Result:** One panel listing both CLI and IDE sessions with identical states, prompts, notifications, and jump-back.

---

## 7) Deep Feasibility Review — THINK DEEPLY

### 7.1 Can a pure proxy emit perfect `PENDING` sentinels?
- **No, not perfectly.** A PTY proxy cannot reliably know when the child process is *reading* from stdin. The kernel does not expose “the child called `read(0,…)`” to the parent via PTY.  
- **What we *can* do:**  
  - Emit **`BEGIN/DONE/ERROR`** sentinels deterministically.  
  - Detect likely `PENDING` using **prompt text + quiet throughput** (very effective in practice).  
  - Optionally, if the agent offers **JSON/automation mode**, we get explicit `awaiting_user`.  
  - If we could **cooperate with the CLI** (env var like `TALLY_MODE=1`), the agent could print hidden markers around prompts → **perfect** mapping. Without cooperation, we remain heuristic for PENDING.

**Conclusion:** The proposed solution **works** and is robust for production with a small tail of ambiguous cases. Provide **Open Terminal** fallback and **Resend** to cover the edge 1–3%.

### 7.2 Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Prompt wording changes | PENDING mis-detected | Medium | Keep **adapters.yaml** editable; use **throughput** + generic patterns (`[y/N]`, numbered menus) |
| Full-screen UIs (curses) | Text scraping harder | Low–Med | Throughput-based detection still works; surface “Possibly waiting” with one-click focus |
| Shell aliases | Shim bypassed | Medium | Installer scans rc files for `alias claude=`; show fix or let user disable alias |
| PATH order differences | Shim not first | Medium | Installer verifies PATH; add `~/.local/bin` early in `~/.zshrc` and `~/.zprofile`; add “Tally Doctor” |
| GUI app PATH vs shell PATH | Inconsistent | Low | We only intercept **terminal** sessions; OK. (Note: Finder-launched GUI may not use shell PATH) |
| iTerm2/tmux behaviors | Focus/jump fails | Low | Tag window/tab titles (`Tally:<taskId>`); use iTerm2 AppleScript/JSON RPC; tmux: select-pane by title |
| Performance (many sessions) | CPU/mem spike | Low | Non-blocking IO; coalesce events; sample at 100–250 ms |
| Secrets in tails | Privacy | Medium | Redact patterns; tails in memory only; opt-in persistent logs |
| Code signing / Gatekeeper | App blocked | Low | Ship proxy as signed Tauri **sidecar**; notarize app |
| Future agent changes | Break detection | Medium | Priority order **sentinel > json > heuristics**; quick adapter updates |

### 7.3 Why not LD_PRELOAD/DYLD interpose?
- On macOS, **hardened runtime** and code signing often block `DYLD_INSERT_LIBRARIES` for third-party signed binaries. Even if possible, it’s brittle and risky. The **proxy + heuristics** approach is safer.

### 7.4 Is this better than Kilo’s in-editor approach?
- Kilo can start the child and use structured events where available — great *inside VS Code*.  
- Tally’s differentiator is **OS-wide aggregation**. The proxy strategy is the only way to see *arbitrary terminals and repos* without changing user behavior. For IDE-native agents, the **IDE Bridge** path gives parity via the same event schema.

**Bottom line:** The plan is technically sound, production-worthy, and future-proof with clear fallbacks.

---

## 8) Rollout Plan

**Phase 1 — Capture & Signals**
- Build `tally-pty-proxy` (PTY, pump, resize, exit).
- PATH shim for `claude`; “Tally Doctor” to verify PATH and detect aliases.
- Classifier with **throughput meter**; emit deterministic `BEGIN/DONE/ERROR` sentinels.

**Phase 2 — PENDING & UX**
- Heuristic `PENDING` (patterns + quiet).  
- Prompt UI with **ACK** (sentinel or heuristic disappearance).  
- Notifications and jump-back (Cursor/VS Code + Terminal focus).

**Phase 3 — Persistence & Polish**
- `sessions.json` (append journal + compact).  
- Tray color (green/amber/red), pulsing amber rows.  
- Settings panel (thresholds, adapter hot-reload).

**Phase 4 — IDE Bridge**
- Universal Event Schema.  
- Minimal Cursor/Windsurf bridge.  
- Publish SDK for partners/teams.

---

## 9) Testing Plan

- **Golden transcripts** per agent (fixtures) → replay & assert state timeline.  
- **Prompt round-trip**: tri-choice prompt → click “Manual” → ACK within 2 s → `WORKING`.  
- **Debounce**: ensure no `PENDING` flicker while output streaming.  
- **Crash**: force exit 1 → `ERROR` with redacted tail.  
- **Multi-repo**: 3 concurrent sessions across different CWDs → all rows present; notifications jump correctly.  
- **Persistence**: restart app mid-session → shows “Detached”; “Reopen terminal” works.

---

## 10) Developer Tasks (Actionable)

- [ ] Sidecar: `tally-pty-proxy` (Rust, portable-pty), non-blocking pumps, resize, signals, exit propagation.
- [ ] Installer: create `~/.local/bin/claude`, update PATH (zshrc/zprofile), “Tally Doctor” checks.
- [ ] Classifier: priority (**sentinel > json > heuristics**), adapters.yaml, bytes/sec meter.
- [ ] Gateway wiring: `/upsert`, `/state`, `/done` posts from proxy; ring buffer tails; redaction.
- [ ] UI: tray aggregate color, pulsing `PENDING`, quick-reply buttons (Y/N/1/Enter), **Open Terminal** fallback.
- [ ] Jump-back: `cursor --reuse-window .` (fallback `code`), AppleScript/iTerm2 focusing.
- [ ] Persistence: `sessions.json` journal + compaction.
- [ ] (Phase 4) IDE Bridge: define schema, sample Cursor plugin, SDK docs.

---

## 11) Open Questions

1. Can we get cooperation from specific CLIs (e.g., `CLAUDE_TALLY=1`) to emit hidden markers for prompts? If yes, `PENDING` detection becomes perfect.
2. Do we want an *optional* “automation mode” where Tally suggests sending “Enter/Yes/1” automatically on common prompts (off by default)?
3. How much history to retain in `sessions.json` by default (e.g., last 14 days)?
4. For Copilot and other closed plugins, what level of presence can we infer without official hooks?

---

## 12) Appendix — Sample Sentinel Frames

> **Note:** Use only where we can reasonably infer the phase; otherwise rely on heuristics.

```
ESC ] 9 ; TALLY=BEGIN id=<sid> cwd=<path> agent=claude BEL
ESC ] 9 ; TALLY=WORKING phase=apply id=<sid> BEL
ESC ] 9 ; TALLY=PENDING kind=yn pid=<uuid> id=<sid> BEL
ESC ] 9 ; TALLY=PROMPT_ACK pid=<uuid> sel=1 id=<sid> BEL
ESC ] 9 ; TALLY=ERROR code=1 id=<sid> BEL
ESC ] 9 ; TALLY=DONE id=<sid> BEL
```

---

**End of Document**
