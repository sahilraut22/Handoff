# handoff

Seamless context transfer and workspace management for AI coding agents (Claude Code, Codex, Gemini CLI, etc.).

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

# Launch a multi-agent workspace (requires tmux)
handoff start claude codex

# Or use the simple context transfer workflow
handoff init
# ... do your work ...
handoff export --message "Auth done, need to implement user profile next"
```

## Workspace Commands (tmux required)

### `handoff start [agents...]`

Launch a tmux session with agents in a grid layout, plus a control pane.

```bash
handoff start claude codex              # 2 agents + control pane
handoff start claude codex gemini       # 3 agents + control pane
handoff start                           # Just control pane, add agents later
handoff start claude --session mywork   # Custom session name
```

The result is a split-pane tmux layout with each agent running in its own labeled pane, and a control pane at the bottom for running `handoff` commands.

### `handoff attach`

Attach to an existing workspace session.

```bash
handoff attach
handoff attach --session mywork
```

### `handoff add <agent>`

Add a new agent pane to the running workspace.

```bash
handoff add gemini
```

### `handoff remove <agent>`

Remove an agent pane (sends exit command if configured, then kills pane).

```bash
handoff remove gemini
```

### `handoff focus <agent>`

Switch tmux focus to an agent pane.

```bash
handoff focus claude
handoff focus codex
```

### `handoff layout <style>`

Change the workspace pane layout.

```bash
handoff layout grid        # Even grid (tiled)
handoff layout horizontal  # All side-by-side
handoff layout vertical    # All stacked
handoff layout tiled       # tmux tiled layout
```

### `handoff kill`

Kill the entire workspace session.

```bash
handoff kill --force
handoff kill --force --session mywork
```

## Context Transfer Commands

### `handoff init`

Initialize a session. Creates a baseline snapshot for change detection.

```bash
handoff init
handoff init --force          # Re-initialize without confirmation
handoff init --dir /path/to   # Target a specific directory
```

### `handoff export`

Export current session context to `HANDOFF.md`.

```bash
handoff export
handoff export --message "Summary of what was done"
handoff export --no-diff              # Only list files, no diffs
handoff export --include-memory       # Include CLAUDE.md / AGENTS.md contents
handoff export --output custom.md     # Custom output path
```

### `handoff ask <agent> "<question>"`

Query another agent in a tmux pane without leaving your current session.

```bash
handoff ask codex "Should we use JWT or sessions?"
handoff ask claude "Review the auth changes" --timeout 30000
handoff ask gemini "What's the best approach?" --no-context
handoff ask --pane %3 "What do you think?"
```

## Pane Management

### `handoff status`

Show the current session status with box-drawn output.

```
┌─────────────────────────────────────────────────────────────────┐
│ HANDOFF STATUS                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Session:    abc123-...                                           │
│ Project:    /path/to/project                                     │
│ Started:    2h 15m ago                                           │
│ Workspace:  handoff (3 panes)                                    │
├─────────────────────────────────────────────────────────────────┤
│ CHANGES SINCE INIT                                               │
│   Modified: 3 files                                              │
│   Added:    1 files                                              │
│   Deleted:  0 files                                              │
├─────────────────────────────────────────────────────────────────┤
│ AGENTS                                                           │
│   ● claude (claude)  pane %0                                     │
│   ○ codex  pane %1                                               │
├─────────────────────────────────────────────────────────────────┤
│ RECENT QUERIES                                                   │
│   -> codex: "review auth implementation" (10 min ago)            │
└─────────────────────────────────────────────────────────────────┘
```

### `handoff list`

List all tmux panes with agent detection and box-drawn table.

```bash
handoff list
```

### `handoff name <label>`

Label the current tmux pane for easier addressing.

```bash
handoff name claude
handoff name codex --pane %3
```

## Configuration

Create `.handoff/config.json` in your project (or `~/.handoffrc` for user-level):

```json
{
  "exclude_patterns": ["node_modules", ".git", "dist", "custom-dir"],
  "max_diff_lines": 50,
  "diff_context_lines": 3,
  "tmux_capture_timeout_ms": 10000,
  "memory_files": ["CLAUDE.md", "AGENTS.md", ".cursorrules", "GEMINI.md"],
  "agents": {
    "myagent": {
      "command": "myagent --interactive",
      "processName": "myagent",
      "exitCommand": "quit"
    }
  }
}
```

## Supported Agents

| Agent | Command | Exit Command |
|-------|---------|-------------|
| claude | `claude` | `/exit` |
| codex | `codex` | - |
| gemini | `gemini` | - |
| aider | `aider` | `/exit` |
| cursor | `cursor` | - |
| copilot | `gh copilot` | - |

Custom agents can be added via config.

## Requirements

- **Node.js** >= 20
- **tmux** - required for workspace commands (`start`, `add`, `remove`, `focus`, `layout`, `attach`, `kill`, `list`, `name`, `ask`)
  - Linux/macOS: install via your package manager
  - Windows: install WSL and tmux inside it (Windows Terminal recommended)

## How It Works

1. `handoff start claude codex` creates a tmux session named `handoff`, splits it into panes (claude, codex, control), labels each, and starts the agent CLIs
2. From the **control pane**, you can run `handoff ask`, `handoff export`, `handoff status`, etc.
3. `handoff init` snapshots your project files to `.handoff/snapshots/`
4. `handoff export` diffs current state vs snapshot and generates `HANDOFF.md`
5. When switching agents, the new agent reads `HANDOFF.md` for full context

All operations are local - no external API calls, no cloud sync.

## File Structure Created

```
your-project/
├── HANDOFF.md           # Generated context file for the next agent
└── .handoff/
    ├── session.json     # Session metadata and file hashes
    ├── workspace.json   # Workspace state (panes, session name)
    ├── config.json      # Optional project config
    ├── queries.log      # Log of all ask queries
    └── snapshots/       # Copies of files at init time (for diffing)
```

Add `.handoff/` to your `.gitignore`.

## License

MIT
