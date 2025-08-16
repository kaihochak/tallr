
# Tally — Feasibility Deep Dive (CLI & IDE Agent Aggregation)
**Date:** 2025‑08‑15  
**Audience:** Engineering (Claude Code implementers), Product, Security  
**Goal:** Decide if our proposed architecture (PATH shim + PTY proxy + heuristics + optional sentinels + IDE bridge) will *actually* work in production, and enumerate the caveats, mitigations, and success criteria.

---

## Executive Verdict (TL;DR)
**Yes — the plan is viable and production‑worthy** for macOS with very high accuracy for `WORKING / PENDING / ERROR / IDLE` across Claude Code and similar CLIs, provided we accept:  
- `PENDING` is **deterministic** only when the tool cooperates (structured events or hidden markers);  
- Without cooperation, `PENDING` is **probabilistic but highly reliable** using **prompt‑pattern + throughput** heuristics (with guardrails and fallbacks);  
- Job control, resizing, and PATH/alias edge cases must be engineered carefully.

For **IDE agents** (Cursor, Windsurf) we can reach parity via a tiny **Tally IDE Bridge** that posts the same events; **Copilot** is partially observable (presence) unless GitHub exposes hooks.

We recommend shipping the proxy + heuristics **now**, and layering in optional cooperation when vendors permit.

---

## What Works, What Doesn’t (No Illusions)
### Works (High Confidence)
- **Capture “plain `claude`” invocations** via a **PATH shim** that execs our **PTY proxy**, while users keep their exact workflow.  
- **Faithful interactive behavior**: the child gets a real PTY slave (colors, menus, arrow keys), so the CLI behaves exactly as in a terminal.  
- **Global visibility**: we can tag sessions with `cwd` and `pid` and surface them in our tray/panel.  
- **Rapid notifications**: streaming lets us detect transitions within hundreds of ms.  
- **Jump‑back**: opening Cursor/VS Code and focusing Terminal/iTerm2 via AppleScript/iTerm RPC works well on macOS once the app is allowed under TCC.

### Partially Works (Truth-in-Engineering)
- **100% correct `PENDING` without CLI cooperation**: *not guaranteed.* A pure proxy cannot know precisely when the child calls `read(0, …)`; the kernel does not expose that to the parent on macOS. We must rely on **text + quiet‑throughput** signals. In practice this is very strong for numbered menus, `[y/N]`, and “Press Enter” prompts.  
- **Applying edits automatically**: feasible if the CLI emits unified diffs or range specs; otherwise, we defer to the agent/IDE and use **jump‑back** for manual approval.

### Doesn’t Work (By Design / Out of Scope)
- **Deep interposition (DYLD/ptrace) to hook syscalls** on hardened, signed binaries — brittle and blocked by SIP; we won’t do it.  
- **Total coverage inside remote containers/SSH** unless our shim is installed there as well. (We’ll detect and warn when we see `$SSH_CONNECTION` and the agent path isn’t under our control.)

---

## Core Constraints and How We Handle Them
### 1) `PENDING` State Detection
- **Deterministic path (best):** tool emits **structured events** (JSON) or we agree on **hidden OSC sentinels** at prompt boundaries.  
- **Proxy reality:** without cooperation, we cannot observe the tool’s `read()` calls.  
- **Our mitigation:** **priority classifier**  
  1. **Sentinel** (when available) → exact mapping.  
  2. **Structured events** (if `--json` exists) → exact.  
  3. **Heuristics** (default): prompt‑pattern **AND** **bytes/sec below threshold** for ≥ 250 ms.  
     - Patterns are kept in `adapters.yaml` (hot‑reloadable) per agent.  
     - Throughput sampling 100–250 ms stabilizes flicker and false positives.  

**Expected accuracy (empirical target):**  
- Claude menus & Y/N prompts: **≥ 97–99%** `PENDING` precision with properly tuned thresholds and debouncing.  
- Ambiguous/full‑screen UIs (rare): we’ll surface **“Possibly waiting”** and prefer jump‑back.

### 2) Job Control & Signals (macOS specifics)
- The proxy must set the child in its own **process group** and call **`tcsetpgrp()`** to hand the **controlling TTY** to the child.  
  - Ensures `^C`/`^Z` go to the child, not the proxy.  
  - On child stop/exit, restore foreground pgid to the shell and re‑enable local echo as needed.  
- **SIGWINCH**: mirror window size with `TIOCSWINSZ` so CLIs render correctly.  
- Non‑blocking pumps with **kqueue** (or `poll`) prevent stalls under load.

### 3) PATH, Aliases, and Hash Tables
- **Shim placement:** `~/.local/bin` prepended to PATH in `~/.zshrc` and `~/.zprofile`.  
- **Rehash**: `hash -r` (zsh/bash) on install.  
- **Alias detection:** scan rc files for `alias claude=` and warn; provide one‑click “comment alias” or “use `tally claude` fallback”.  
- **Absolute paths** (`/usr/local/bin/claude`) bypass shim — acceptable tradeoff; we’ll detect and warn in “Tally Doctor.”

### 4) Terminal Environments
- **tmux:** proxy still works; we focus the outer terminal; optional tmux integration later.  
- **less/pagers:** detect `--More--`/`(END)`; present “Continue” quick‑reply.  
- **Remote SSH:** only works if shim exists remotely; otherwise we show local presence only and a hint.

### 5) TCC/Permissions (Jump‑back)
- Focusing Terminal/iTerm2 or Cursor/VS Code via AppleScript prompts “Automation” permission. We must:  
  - Show an **onboarding step** to grant Automation/Accessibility.  
  - Gracefully degrade if denied (still notify, let user click the dock).

### 6) Performance and Stability
- Stream pumps are O(1) per FD; with kqueue and batched writes we stay well under CPU limits for 10–20 concurrent sessions.  
- Memory: ring buffer per session (8–16 KB) is negligible; history in `sessions.json` is compacted regularly.

---

## IDE Agents: Will This Generalize?
- **Cursor/Windsurf**: both are VS Code‑family IDEs and support the **VS Code extension API**; a tiny “Tally IDE Bridge” can post the same events we use for CLIs (start, pending with choices, ack, error, done). This gives **parity UI** without scraping.  
- **GitHub Copilot**: closed; we can only offer **presence** (on/off, maybe “waiting”) if no hooks are available. If GitHub exposes APIs later, we can flip to full parity quickly because our **Universal Event Schema** is already defined.  
- **Outcome:** the **panel is unified**: CLI sessions via proxy; IDE sessions via bridge — same states, same notifications, same jump‑back semantics.

---

## Where This Could Break (and Our Plan B)
1. **Prompt text drift**: Update `adapters.yaml` (hot‑reload) and keep **golden transcripts** for regression tests.  
2. **Curses/full‑screen apps**: Use **throughput‑only** detection and label as **“Possibly waiting”** with jump‑back.  
3. **User has `claude` alias**: Installer flags it and offers to disable; otherwise suggest `tally claude` command.  
4. **Finder‑launched GUI PATH**: Not relevant — we intercept **terminal** sessions; document limitation.  
5. **AppleScript permission denied**: Notify only; add “Copy path” and “Open IDE manually” buttons.  
6. **Remote dev containers**: Provide a remote installer script to add the shim inside the container/VM; else mark session as **untracked**.

---

## Security/Privacy Posture
- Gateway is **localhost only**, optional bearer token.  
- We store minimal metadata: `{repoPath, agent, pid, state, lastEventAt, tail}`.  
- **Redaction**: scrub `sk-…`, AWS keys, JWTs from `details`.  
- **No code ingestion** by default; full transcripts require explicit opt‑in.  
- App and sidecar are **signed & notarized**.

---

## Success Metrics (MVP)
- **Capture rate**: ≥ 95% of locally started `claude` sessions appear in Tally within 1 s of start.  
- **PENDING precision**: ≥ 97% on our Claude test corpus; no more than 1% false‑positives across 10 concurrent sessions.  
- **Notification latency**: ≤ 1 s from prompt emission to desktop toast.  
- **Jump‑back success**: ≥ 98% (focus correct IDE + terminal).  
- **Crash resilience**: 0 data loss beyond in‑memory ring tail; sessions re‑listed after app restart.

---

## Validation Plan
- **Golden transcripts**: collect real outputs for Claude/Gemini; replay through classifier; assert exact state timeline.  
- **Prompt round‑trip tests**: tri‑choice prompt → click “Manual” → require ACK (sentinel/heuristic) within 2 s.  
- **Heuristic stress**: fast type‑ahead, long outputs, spinners; ensure debounced `PENDING`.  
- **Job control**: ^C/^Z behavior matches native terminal; fg/bg cycles work.  
- **PATH/alias**: “Tally Doctor” verifies shim position and flags aliases.  
- **TCC onboarding**: first‑run flow grants Automation; decline path degrades gracefully.

---

## Open Choices (Recommend)
- **Sentinels from proxy:** Emit lifecycle (`BEGIN/DONE/ERROR`) always; emit `PENDING` only when we are confident; do **not** pretend we can mark every prompt perfectly without cooperation.  
- **Expose `CLAUDE_TALLY=1` env** opt‑in for teams; if Claude CLI ever reads it and emits hidden markers, we automatically switch to **deterministic** mode.  
- **Adapters.yaml**: ship conservative generic patterns; allow users to tailor per agent/version.

---

## Final Call
The architecture is the **correct one** for OS‑wide aggregation with minimal user friction. The only unavoidably probabilistic piece — `PENDING` without cooperation — is tamed by **throughput‑gated prompts**, **debouncing**, hot‑updatable **adapters**, and user‑visible fallbacks. We should proceed, track the success metrics above, and add cooperative markers wherever vendors allow.

**Ship it.**
