---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''

---

## Bug Description
A clear and concise description of what the bug is.

## Steps to Reproduce
1. Go to '...'
2. Click on '....'
3. Run command '....'
4. See error

## Expected Behavior
A clear and concise description of what you expected to happen.

## Actual Behavior
A clear and concise description of what actually happened.

## Screenshots
If applicable, add screenshots to help explain your problem.

## Environment
- **macOS Version:** [e.g. macOS 14.1]
- **Tallr Version:** [e.g. 0.1.1]
- **Node.js Version:** [e.g. 20.19.0] (if building from source)
- **AI Tool:** [e.g. Claude, Gemini, Codex]

## Debug Information
If you can reproduce the issue, please run with debug enabled:
```bash
DEBUG=1 tallr claude
```
And paste any relevant output here.

## Log Files
Please attach log files from:
- **Rust backend logs**: `~/Library/Application Support/Tallr/logs/tallr.log`
- **CLI wrapper logs**: `~/Library/Application Support/Tallr/logs/cli-wrapper.log`

You can find these files by running:
```bash
open ~/Library/Application\ Support/Tallr/logs/
```

## Frequency
How often does this issue occur?
- [ ] Always
- [ ] Sometimes 
- [ ] Rarely
- [ ] Only once

## Additional Context
Add any other context about the problem here.