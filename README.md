# handoff

Seamless context transfer and workspace management for AI coding agents (Claude Code, Codex, Gemini CLI, etc.).

## How It Works

`handoff` has two core capabilities that work together:

- **Context transfer** (`init`/`export`/`HANDOFF.md`) -- memory sharing between agents
- **Bridge** (`bridge spawn`/`message`/`read`) -- communication channel between agents

**Agents are the users of handoff.** The human prompts their preferred agent, and the agent uses handoff commands as bash tools:

```bash
# User tells Claude: "set up codex to help with this project"
# Claude runs:
handoff init                                     # snapshot project files
handoff export --message "Auth done, JWT chosen" # generate HANDOFF.md
handoff bridge spawn codex                       # open codex side-by-side
handoff bridge read codex 20                     # check codex is ready
handoff bridge message codex "Read HANDOFF.md for full context, then implement user profiles"
# ...later...
handoff bridge read codex 50                     # read codex's progress
```

## Quick Start

```bash
# Install
npm install -g handoff-cli

# One-time setup (keyboard shortcuts + mouse support)
handoff setup

# Launch workspace with agents
handoff start claude codex

# Or: start with just Claude, spawn codex from within Claude
handoff start claude
# Then ask Claude: "spawn codex side by side"
# Claude runs: handoff bridge spawn codex
```

## Setup

```bash
handoff setup
```

Installs the tmux config at `~/.handoff/tmux.conf` with mouse support, pane labels, and keyboard shortcuts. Prints diagnostics and a keyboard shortcut cheatsheet.

Options: `--no-keybindings`, `--no-clipboard`, `--no-pane-labels`

## Bridge Commands (Agent-to-Agent IPC)

These commands are designed to be called by agents (Claude, Codex, etc.) from within their terminal sessions.

### `handoff bridge spawn <agent>`

Open an agent in a new pane adjacent to the current pane.

```bash
handoff bridge spawn codex          # side-by-side (default)
handoff bridge spawn gemini --vertical  # stacked
```

### `handoff bridge read <target> [lines]`

Read the last N lines from a pane (default: 50). Records a read for the guard system.

```bash
handoff bridge read codex 50
handoff bridge read %3 20
handoff bridge read claude
```

### `handoff bridge message <target> <text>`

Send a message to another agent with auto-prepended `[from: <sender>]` metadata.

```bash
handoff bridge message codex "Review the auth middleware in src/auth.ts"
handoff bridge message gemini "What's the best approach for caching here?"
```

### `handoff bridge type <target> <text>`

Type literal text into a pane WITHOUT pressing Enter. Use `bridge keys` to send Enter.

```bash
handoff bridge type codex "ls -la"
handoff bridge keys codex Enter
```

### `handoff bridge keys <target> <key...>`

Send special key(s) to a pane.

```bash
handoff bridge keys codex Enter
handoff bridge keys codex Escape
handoff bridge keys codex Ctrl+C
handoff bridge keys codex Up Up Enter
```

Supported keys: `Enter`, `Escape`, `Tab`, `Space`, `Backspace`, `Delete`, `Up`, `Down`, `Left`, `Right`, `Home`, `End`, `PageUp`, `PageDown`, `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+A`, `Ctrl+L`, `Ctrl+R`

### `handoff bridge list`

List all panes in the current session.

```bash
handoff bridge list            # pipe-delimited (machine-readable)
handoff bridge list --pretty   # formatted table
```

### `handoff bridge id`

Print the current pane's ID and label.

### `handoff bridge resolve <label>`

Resolve a label to a pane ID.

```bash
handoff bridge resolve codex   # prints: %1
```

### `handoff bridge name <target> <label>`

Assign a label to a pane.

```bash
handoff bridge name %3 codex
```

### `handoff bridge doctor`

Diagnose tmux connectivity and bridge health.

## Workspace Commands

### `handoff start [agents...]`

Launch a tmux workspace with agents in a grid layout. Automatically installs keyboard config.

```bash
handoff start claude codex              # 2 agents + control pane
handoff start claude codex gemini       # 3 agents + control pane
handoff start                           # just control pane
handoff start claude --session mywork   # custom session name
```

### `handoff attach`

Attach to an existing workspace.

```bash
handoff attach
handoff attach --session mywork
```

### `handoff add <agent>` / `handoff remove <agent>`

Dynamically add or remove agent panes.

```bash
handoff add gemini
handoff remove gemini
```

### `handoff focus <agent>`

Switch tmux focus to an agent pane.

```bash
handoff focus claude
handoff focus codex
```

### `handoff layout <style>`

Change workspace layout: `grid`, `horizontal`, `vertical`, `tiled`.

### `handoff kill`

Kill the workspace session.

```bash
handoff kill --force
```

## Context Transfer Commands

### `handoff init`

Snapshot all project files for change detection.

```bash
handoff init
handoff init --force   # re-initialize
```

### `handoff export`

Export changes as `HANDOFF.md` for the next agent.

```bash
handoff export
handoff export --message "Summary of what was done"
handoff export --no-diff          # file list only
handoff export --include-memory   # include CLAUDE.md, AGENTS.md
```

### `handoff ask <agent> "<question>"`

Ask another agent a question and wait for the response.

```bash
handoff ask codex "Should we use Redis or in-memory caching?"
handoff ask claude "Review the auth changes" --timeout 30000
handoff ask gemini "What's the best approach?" --no-context
```

### `handoff status`

Show session status with change counts, active agents, and recent queries.

### `handoff list`

List all tmux panes with agent detection.

### `handoff name <label>`

Label the current tmux pane.

```bash
handoff name claude
handoff name codex --pane %3
```

## Keyboard Shortcuts (after `handoff setup`)

No `Ctrl+B` prefix needed for any of these:

| Key | Action |
|-----|--------|
| `Alt+i` | Move to pane above |
| `Alt+k` | Move to pane below |
| `Alt+j` | Move to pane left |
| `Alt+l` | Move to pane right |
| `Alt+n` | Split pane side-by-side + auto-tile |
| `Alt+w` | Close current pane |
| `Alt+o` | Cycle layouts |
| `Alt+g` | Mark pane |
| `Alt+y` | Swap with marked pane |
| `Alt+u` | Next window |
| `Alt+h` | Previous window |
| `Alt+m` | New window |
| `Alt+Tab` | Toggle scroll/copy mode |

Mouse click selects panes. Drag to select text copies to clipboard automatically.

## Configuration

Create `.handoff/config.json` in your project (or `~/.handoffrc` for user-level):

```json
{
  "exclude_patterns": ["node_modules", ".git", "dist"],
  "max_diff_lines": 50,
  "tmux": {
    "mouse": true,
    "keybindings": true,
    "paneLabels": true,
    "clipboard": true
  },
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

| Agent | Command | Memory File |
|-------|---------|-------------|
| claude | `claude` | `CLAUDE.md` |
| codex | `codex` | - |
| gemini | `gemini` | `GEMINI.md` |
| aider | `aider` | - |
| cursor | `cursor` | `.cursorrules` |
| copilot | `gh copilot` | - |

## Requirements

- **Node.js** >= 20
- **tmux** - required for workspace and bridge commands
  - Linux/macOS: install via package manager
  - Windows: install WSL and tmux inside it (Windows Terminal recommended)

## File Structure

```
your-project/
├── HANDOFF.md           # Generated context file
└── .handoff/
    ├── session.json     # File hashes for change detection
    ├── workspace.json   # Active workspace pane mapping
    ├── queries.log      # History of bridge/ask queries
    ├── config.json      # Optional project config
    └── snapshots/       # File copies for diffing

~/.handoff/
    ├── tmux.conf        # Generated tmux config (keyboard, mouse, labels)
    └── read-guard.json  # Bridge read-guard state
```

## License

MIT
