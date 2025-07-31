# USER.md

# Tally (macOS Beta) — Install & Use

## Requirements
- macOS 13+ (Intel or Apple Silicon)
- Cursor or VS Code installed (preferably both; Cursor prioritized)
- Terminal.app or iTerm2

> **Privacy:** Local-only. Stores minimal task metadata in a local JSON file. No telemetry.

---

## Install (Unsigned Week-1 Build)
1. Download the `.zip`/`.dmg` and move `Tally.app` to `/Applications`.  
2. First run (unsigned): Right-click **Tally.app** → **Open** → **Open**.  
3. Approve prompts:  
   - **Notifications** (alerts when agents need input)  
   - **Automation** (let Tally open/focus IDE & Terminal/iTerm)

*Start at login:* System Settings → General → **Login Items** → add **Tally**.

---

## First-Run Setup
1. Click the **menu-bar icon** (top-right).  
2. **Settings** → choose defaults:  
   - **IDE:** *Cursor* (first), *VS Code* (fallback)  
   - **Terminal:** Terminal or iTerm2  
   - *(Optional)* **Security token** (e.g., `devtoken`)  
3. *(Optional)* Add a project manually (name + repo path) to test UI.

---

## How It Works
- Your AI CLIs or scripts **POST** task updates to Tally’s local gateway: `http://127.0.0.1:4317`.  
- Tally shows **Projects** and **Agent Tasks** with state badges:  
  `RUNNING`, `WAITING_USER`, `BLOCKED`, `ERROR`, `DONE`, `IDLE`.
- On `WAITING_USER`/`ERROR`, you get a **desktop notification**.  
- Click a notification (or a row) to **jump** into **Cursor/VS Code** at the repo and a **Terminal/iTerm tab** in that repo.

---

## Quick Start (No Agent Required)
If you set a token in Settings:
```bash
export TALLY_TOKEN=devtoken   # also accepts SWITCHBOARD_TOKEN for compatibility
```

**Create a task**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"project":{"name":"course-rater","repoPath":"/Users/you/dev/course-rater","preferredIDE":"cursor"},
       "task":{"id":"t1","agent":"custom","title":"Migrate DB","state":"WAITING_USER","details":"Approve? [y/N]"}}'   http://127.0.0.1:4317/v1/tasks/upsert
```

**Change state**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"taskId":"t1","state":"RUNNING","details":"Applying migration..."}'   http://127.0.0.1:4317/v1/tasks/state
```

**Mark done**
```bash
curl -H "Authorization: Bearer $TALLY_TOKEN" -H "Content-Type: application/json"   -d '{"taskId":"t1","details":"Migration applied"}'   http://127.0.0.1:4317/v1/tasks/done
```

You should see the task in the panel within **≤2s** and get a **WAITING_USER** alert.

---

## Wrap Your Agent (Recommended)

Use the provided **Node wrapper** to auto-detect prompts and post `WAITING_USER`.

Save as `tl-wrap.js`:
```ts
// tl-wrap.js
import { spawn } from "child_process";

const GW = process.env.TALLY_URL || "http://127.0.0.1:4317";
const TOKEN = process.env.TALLY_TOKEN || process.env.SWITCHBOARD_TOKEN || "";

async function post(path, body) {
  const res = await fetch(`${GW}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : {})
    },
    body: JSON.stringify(body)
  }).catch(()=>{});
  return res;
}

const project = {
  name: process.env.TL_PROJECT || process.env.SB_PROJECT || "my-project",
  repoPath: process.env.TL_REPO || process.env.SB_REPO || process.cwd(),
  preferredIDE: process.env.TL_IDE || process.env.SB_IDE || "cursor"
};
const taskId = process.env.TL_TASK_ID || process.env.SB_TASK_ID || `task-${Date.now()}`;
const agent = process.env.TL_AGENT || process.env.SB_AGENT || "custom";
const title = process.env.TL_TITLE || process.env.SB_TITLE || "Agent run";

(async () => {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  if (!cmd) {
    console.error("Usage: node tl-wrap.js <your-agent-cli> [args...]");
    process.exit(1);
  }

  await post("/v1/tasks/upsert", { project, task: { id: taskId, agent, title, state: "RUNNING" }});

  const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
  const NEEDLE = /(\[y\/N\]|requires approval|enter input:|awaiting confirmation|press y to|approve|confirm)/i;

  child.stdout.on("data", async (buf) => {
    const line = buf.toString();
    process.stdout.write(line);
    if (NEEDLE.test(line)) {
      await post("/v1/tasks/state", { taskId, state: "WAITING_USER", details: line.trim() });
    } else {
      await post("/v1/tasks/state", { taskId, state: "RUNNING" });
    }
  });

  child.stderr.on("data", (buf) => process.stderr.write(buf));

  child.on("close", async (code) => {
    await post(code == 0 ? "/v1/tasks/done" : "/v1/tasks/state",
      code == 0 ? { taskId, details: "Done" } : { taskId, state: "ERROR", details: `Exit ${code}` });
    process.exit(code or 1);
  });

  process.stdin.pipe(child.stdin);
})();
```

Run your agent through the wrapper:
```bash
export TALLY_TOKEN=devtoken
export TL_PROJECT="course-rater"
export TL_REPO="/Users/you/dev/course-rater"
export TL_AGENT="claude"   # or gemini/codecs/custom
export TL_TITLE="Plan migration"

node tl-wrap.js claude --plan    # example
```

Create per-project aliases:
```bash
alias cr-claude='TALLY_TOKEN=devtoken TL_PROJECT=course-rater TL_REPO=/Users/you/dev/course-rater node ~/bin/tl-wrap.js claude'
```

---

## Troubleshooting
- **No notifications:** enable in System Settings → Notifications → **Tally**.  
- **IDE won’t focus:** install `code` / `cursor` CLI; toggle IDE in Settings; fallback uses `open -a`.  
- **Terminal tab fails:** approve Automation prompt; switch between Terminal/iTerm in Settings.  
- **401/403:** token mismatch between app and environment.  
- **No tasks appear:** verify your POST with `curl`; ensure unique `task.id`.

---

## FAQ
- **Does code leave my machine?** No. Local-only.  
- **Do I need the wrapper?** No; you can POST directly from your scripts/agents.  
- **Windows/Linux?** Not in week-1.  
- **MCP support?** Planned; week-1 is HTTP only.
