// tools/tl-wrap.js
// Generic wrapper to run any agent CLI and relay status to Tally via localhost HTTP (Node 18+ with global fetch).
import { spawn } from "child_process";

const GW = process.env.TALLY_URL || "http://127.0.0.1:4317";
const TOKEN = process.env.TALLY_TOKEN || process.env.SWITCHBOARD_TOKEN || "";

async function post(path, body) {
  try {
    await fetch(`${GW}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : {})
      },
      body: JSON.stringify(body)
    });
  } catch {}
}

const project = {
  name: process.env.TL_PROJECT || process.env.SB_PROJECT || "my-project",
  repoPath: process.env.TL_REPO || process.env.SB_REPO || process.cwd(),
  preferredIDE: process.env.TL_IDE || process.env.SB_IDE || "cursor"
};
const taskId = process.env.TL_TASK_ID || process.env.SB_TASK_ID || `task-${Date.now()}`;
const agent = process.env.TL_AGENT || process.env.SB_AGENT || "custom";
const title = process.env.TL_TITLE || process.env.SB_TITLE || "Agent run";

const args = process.argv.slice(2);
const cmd = args.shift();
if (!cmd) {
  console.error("Usage: node tools/tl-wrap.js <your-agent-cli> [args...]");
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
  if (code === 0) {
    await post("/v1/tasks/done", { taskId, details: "Done" });
  } else {
    await post("/v1/tasks/state", { taskId, state: "ERROR", details: `Exit ${code}` });
  }
  process.exit(code ?? 1);
});

process.stdin.pipe(child.stdin);
