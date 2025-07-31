# CLAUDE.md

# Using Tally with Claude (CLI & VS Code)

This guide shows how to wire **Claude CLI** (or scripts that call Anthropic) and **Claude Code (VS Code)** into **Tally** so you get **WAITING_USER** alerts and one-click **jump to context**.

> Week-1 focuses on the **local HTTP gateway**. No MCP needed.

---

## Prereqs
- **Tally** running (see `USER.md`).  
- **Cursor** and/or **VS Code** installed.  
- **Claude CLI** installed and working (`claude --help`), or your own script that shells out to Claude.

---

## Option A — Wrap Claude CLI with `tl-wrap.js` (Recommended)

1) Ensure you’ve saved the wrapper from `USER.md` as `tl-wrap.js`.  
2) Set per-project env and run Claude via the wrapper:

```bash
export TALLY_TOKEN=devtoken
export TL_PROJECT="course-rater"
export TL_REPO="/Users/you/dev/course-rater"
export TL_AGENT="claude"
export TL_TITLE="Generate migration plan"

node tl-wrap.js claude --plan   # replace with your actual Claude CLI args
```

- The wrapper watches STDOUT for prompts such as `Approve? [y/N]`, `requires approval`, `awaiting confirmation`, etc.  
- On detection, it POSTs `WAITING_USER` so you get a desktop notification.  
- Clicking the notification opens **Cursor/VS Code** at `TL_REPO` and a terminal tab in that directory.

**Tips**
- If your CLI prints a different approval phrase, extend `NEEDLE` in the wrapper.  
- You can create a shell alias for convenience:
```bash
alias cr-claude='TALLY_TOKEN=devtoken TL_PROJECT=course-rater TL_REPO=/Users/you/dev/course-rater node ~/bin/tl-wrap.js claude'
```

---

## Option B — Explicit POSTs from Your Script (No Wrapper)

If you have a Node/Python script that orchestrates Claude runs, call the Tally gateway directly:

**Create/Upsert**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"project":{"name":"course-rater","repoPath":"/Users/you/dev/course-rater","preferredIDE":"cursor"},
       "task":{"id":"cr-claude-1","agent":"claude","title":"Refactor auth","state":"RUNNING"}}'   http://127.0.0.1:4317/v1/tasks/upsert
```

**Flip to waiting**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"taskId":"cr-claude-1","state":"WAITING_USER","details":"Approve file changes? [y/N]"}'   http://127.0.0.1:4317/v1/tasks/state
```

**Back to running / done**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"taskId":"cr-claude-1","state":"RUNNING","details":"Applying changes..."}'   http://127.0.0.1:4317/v1/tasks/state

curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"taskId":"cr-claude-1","details":"Changes applied"}'   http://127.0.0.1:4317/v1/tasks/done
```
