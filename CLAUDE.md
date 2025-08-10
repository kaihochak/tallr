# Using Tally with Claude Code & Other AI CLIs

This guide shows how to use **Tally** with **Claude Code CLI**, **Gemini CLI**, and other AI terminal tools for automatic session tracking and notifications.

---

## Setup (One-time)

### Production Users
1. Download `Tally.dmg` from releases
2. Drag `Tally.app` to Applications
3. Launch Tally → Click "Install CLI Tools"
4. Done! Now just use `claude` normally

### Developers
1. Run `npm run tauri:dev` 
2. Click "Install CLI Tools" in the setup wizard
3. Test with `claude` in any project

---

## Usage

### Natural Workflow
```bash
# Just use Claude like you always do - now it's tracked!
cd my-project
claude

# Start chatting normally:
> Help me debug this authentication issue
> The login form isn't working properly  
> Can you review this code change?
> exit
```

### What Tally Adds
- **Dashboard**: See "my-project - Claude session" in Tally window
- **Notifications**: Desktop alert when Claude asks "Approve? [y/N]"
- **Jump-to-Context**: Click notification → opens VS Code/Cursor + terminal at project
- **History**: Track all your AI sessions across projects
- **Timers**: Optional project timeboxing with gentle alerts

### Supported AI Tools
- **Claude Code**: `claude` (interactive chat)
- **Gemini CLI**: `gemini` (if installed)
- **Future**: Any CLI tool that uses interactive prompts

---

## Behind the Scenes

When you run `claude`, Tally's shell integration:
1. **Starts tracking**: Creates task "Claude session" for current project
2. **Monitors output**: Watches for approval prompts, errors
3. **Sends notifications**: Desktop alerts when Claude needs input
4. **Enables jumping**: Click task → open IDE + terminal at project

### What Gets Auto-Detected
- **Project name**: From directory name or git repo
- **Repo path**: Current working directory  
- **Agent**: "claude", "gemini", etc.
- **State changes**: RUNNING → WAITING_USER → DONE/ERROR

---

## Troubleshooting

### "Command not found: claude"
- Install Claude Code CLI first
- Restart terminal after Tally setup

### "Tasks not appearing in Tally"
- Ensure Tally app is running
- Check that shell integration installed correctly:
  ```bash
  type claude  # Should show function, not just the binary
  ```

### "Notifications not working"
- Allow notifications when macOS prompts
- Check System Preferences → Notifications → Tally

### "Can't click to jump to project"  
- Allow shell commands when macOS prompts
- Grant Terminal automation if prompted

---

## Advanced Usage

### Custom Project Names
Set environment variable before running:
```bash
export TL_PROJECT="My Custom Project Name"
claude
```

### Different IDEs
```bash
export TL_IDE="code"  # or "cursor", "webstorm"
claude
```

### Manual Task Creation (for non-CLI tools)
```bash
curl -H "Authorization: Bearer devtoken" \
     -H "Content-Type: application/json" \
     -d '{"project":{"name":"'$(basename $(pwd))'","repoPath":"'$(pwd)'"},
          "task":{"id":"manual-'$(date +%s)'","agent":"copilot","title":"VS Code chat","state":"RUNNING"}}' \
     http://127.0.0.1:4317/v1/tasks/upsert
```

The beauty of Tally is that it gets out of your way - just use your AI tools normally, and gain visibility + notifications automatically!