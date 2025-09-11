# Phase 3a (SDK PENDING) – Current State and How To Test

## Summary
- Default (stable): Phase 1/2 only. WORKING/IDLE via fetch spy.
- SDK path (Phase 3a): Opt-in via `TALLR_SDK_MODE=true` or `--sdk`.
- Early PENDING: Emits `permission-prompt` when Claude asks to proceed.
- Authoritative PENDING: Emits `permission-request` on SDK tool attempt.
- IPC: fd 3 telemetry; fd 4 control only in SDK mode. See plan’s IPC section.

## Commands
- Baseline sanity:
  - `./tools/tallr claude --print "hello"`
  - `DEBUG=tallr:network ./tools/tallr claude --print "hello"` → expect fetch-start/fetch-end

- Enable SDK (Phase 3a):
  - One-time: `chmod +x tools/lib/claude-remote-launcher.cjs`
  - `TALLR_SDK_MODE=true ./tools/tallr claude --print "hello"`
  - `TALLR_SDK_MODE=true DEBUG=tallr:state,tallr:network ./tools/tallr claude --print` then type a tool prompt; expect PENDING on ask-to-proceed; `/allow` to continue for dev

## Notes
- SDK spawn errors fall back to CLI automatically; default runs remain unaffected.
- UI message consumption (Phase 3b) and approval loop (Phase 4) are separate.
