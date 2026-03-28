# handoff

Seamless context transfer between AI coding agents (Claude Code, Codex, Gemini CLI, etc.) when switching due to rate limits or preference.

## The Problem

When you hit rate limits on one AI agent and switch to another:
- Context is lost - the new agent doesn't know what was done
- Decisions aren't transferred - architectural choices, rejected approaches
- Re-explanation takes 5-10 minutes each time

`handoff` fixes this with a single command.

## Quick Start

```bash
# Install globally
npm install -g handoff-cli

# 1. Start a session at the beginning of your work
handoff init

# 2. Do your work... when ready to switch agents:
handoff export --message "Implementing auth middleware, JWT tokens chosen over sessions"

# 3. The new agent reads HANDOFF.md for full context
# Or query the other agent directly:
handoff ask codex "Should we use Redis or in-memory for session storage?"
```

## Commands

### `handoff init`

Initialize a session. Creates a baseline snapshot for change detection.

```bash
handoff init
handoff init --force          # Re-initialize without confirmation
handoff init --dir /path/to   # Target a specific directory
```

Creates `.handoff/session.json` and `.handoff/snapshots/` in the project root.

### `handoff export`

Export current session context to `HANDOFF.md`.

```bash
handoff export
handoff export --message "Summary of what was done"
handoff export --no-diff              # Only list files, no diffs
handoff export --include-memory       # Include CLAUDE.md / AGENTS.md contents
handoff export --output custom.md     # Custom output path
```

Generates `HANDOFF.md` with session info, file changes, diffs, and optional context.

### `handoff ask <agent> "<question>"`

Query another agent in a tmux pane without leaving your current session.

```bash
handoff ask codex "Should we use JWT or sessions?"
handoff ask claude "Review the auth changes in the diff" --timeout 30000
handoff ask gemini "What's the best approach here?" --no-context
handoff ask --pane %3 "What do you think?"
```

Supported agents: `claude`, `codex`, `gemini`, `aider`, `cursor`, `copilot`

### `handoff status`

Show the current session status.

```bash
handoff status
```

Output:
```
Session:     abc123-...
Started:     2026-03-28T10:00:00Z (2h 15m ago)
Working Dir: /path/to/project
Tracking:    47 files

Changes since init:
  Modified: 3 files
  Added:    1 files
  Deleted:  0 files

Last export: 2026-03-28T11:30:00Z (30m ago)

Active agents:
  claude (pane %0, label: claude-1)
  codex  (pane %3)
```

### `handoff name <label>`

Label the current tmux pane for easier addressing.

```bash
handoff name claude
handoff name codex --pane %3
```

### `handoff list`

List all tmux panes with agent detection.

```bash
handoff list
```

Output:
```
PANE     LABEL            PROCESS          AGENT      STATUS
%0       claude-1         claude           claude     active
%3       (none)           codex            codex      idle
%5       -                zsh              -          -
```

## Configuration

Create `.handoff/config.json` in your project (or `~/.handoffrc` for user-level config):

```json
{
  "exclude_patterns": ["node_modules", ".git", "dist", "custom-dir"],
  "max_diff_lines": 50,
  "diff_context_lines": 3,
  "tmux_capture_timeout_ms": 10000,
  "memory_files": ["CLAUDE.md", "AGENTS.md", ".cursorrules", "GEMINI.md"]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `exclude_patterns` | `["node_modules", ".git", "dist", ...]` | Files/directories to ignore |
| `max_diff_lines` | `50` | Max lines per diff in HANDOFF.md |
| `diff_context_lines` | `3` | Context lines around each diff hunk |
| `tmux_capture_timeout_ms` | `10000` | Timeout waiting for agent responses |
| `memory_files` | `["CLAUDE.md", "AGENTS.md", ...]` | Agent memory files to include with `--include-memory` |

## Requirements

- **Node.js** >= 20
- **tmux** - required for `ask`, `list`, `name` commands
  - Linux/macOS: install via your package manager
  - Windows: install WSL and tmux inside it

## How It Works

1. `handoff init` walks your project files, hashes them, and saves copies to `.handoff/snapshots/`
2. `handoff export` re-hashes files, diffs against snapshots, and generates `HANDOFF.md`
3. `handoff ask` sends a prompt (with HANDOFF.md context) to another agent's tmux pane and captures the response

All operations are local - no external API calls, no cloud sync.

## File Structure Created

```
your-project/
├── HANDOFF.md           # Generated context file for the next agent
└── .handoff/
    ├── session.json     # Session metadata and file hashes
    ├── config.json      # Optional project config
    ├── queries.log      # Log of all ask queries
    └── snapshots/       # Copies of files at init time (for diffing)
```

Add `.handoff/` to your `.gitignore` - it contains file copies and is project-local.

## License

MIT
