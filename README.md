# handoff

[![CI](https://github.com/sahilraut22/Handoff/actions/workflows/ci.yml/badge.svg)](https://github.com/sahilraut22/Handoff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Seamless context transfer, decision journaling, and workspace management for AI coding agents.

## Why handoff?

When multiple AI agents work on the same codebase -- or when you start a new session after context is lost -- agents waste time re-reading code, re-discovering decisions, and duplicating analysis. `handoff` solves this by:

- **Snapshotting** file state so agents know exactly what changed
- **Exporting** intelligent diffs with semantic summaries and token budgeting
- **Recording** architectural decisions so rationale is never lost
- **Spawning** agents side-by-side in tmux for real-time collaboration
- **Routing** messages between agents via tmux panes

Agents are the primary users. The human prompts their agent; the agent uses `handoff` commands as bash tools.

## Installation

```bash
# From npm (once published)
npm install -g handoff-cli

# From GitHub (available now)
npm install -g github:sahilraut22/Handoff
```

## Quick Start

```bash
# Install
npm install -g github:sahilraut22/Handoff

# One-time tmux setup (keyboard shortcuts, mouse, pane labels)
handoff setup

# In your project:
handoff init                                          # snapshot current state
handoff export --message "Implemented auth middleware" # generate HANDOFF.md

# Record a decision
handoff decide "Use JWT for auth" \
  --context "Need stateless sessions for horizontal scaling" \
  --alternatives "Session cookies" "OAuth2 only" \
  --tags auth security

# Validate your HANDOFF.md
handoff validate

# Launch workspace with Claude + Codex side-by-side
handoff start claude codex
```

## Architecture

```
Context Transfer            Agent IPC               Decision Journal
─────────────────          ─────────────           ─────────────────
handoff init               handoff bridge spawn    handoff decide
handoff export             handoff bridge message  handoff decisions
HANDOFF.md (v2.0 spec)    handoff bridge read     .handoff/decisions/
YAML frontmatter           tmux pane routing       YAML per decision
```

## Context Transfer Commands

### `handoff init`

Snapshot all project files for change detection.

```bash
handoff init
handoff init --force   # re-initialize
```

### `handoff export`

Export changes as `HANDOFF.md` for the next agent or session.

```bash
handoff export                                 # basic export
handoff export --message "Auth done, JWT chosen"
handoff export --compress                      # intelligent compression
handoff export --compress --token-budget 4000  # tighter budget
handoff export --include-decisions             # include decision journal
handoff export --include-memory                # include CLAUDE.md, AGENTS.md
handoff export --no-diff                       # file list only, no diffs
handoff export --format json                   # structured JSON output
handoff export --format claude                 # CLAUDE.md compatible snippet
handoff export --format agents                 # AGENTS.md compatible section
```

**Compression** (`--compress`) uses priority-based classification:
- `critical` -- package.json, auth files, .env, CI/CD, migrations
- `high` -- src/lib/, API routes, test files, index/main/server
- `medium` -- components, utilities, type definitions
- `low` -- docs, lock files, generated code

Diffs are compressed per-tier within the token budget, with semantic summaries showing which functions/classes changed.

### `handoff validate`

Validate a HANDOFF.md against the v2.0 protocol spec.

```bash
handoff validate                     # validate ./HANDOFF.md
handoff validate path/to/HANDOFF.md  # specific file
handoff validate --strict            # treat warnings as errors
```

### `handoff schema`

Print or export the JSON Schema for HANDOFF.md frontmatter.

```bash
handoff schema                       # print to stdout
handoff schema --output schema.json  # write to file
```

## Decision Journal

Record, search, and retrieve architectural decisions from any agent.

### `handoff decide`

```bash
handoff decide "Use PostgreSQL over MongoDB" \
  --context "Need ACID guarantees for financial transactions" \
  --decision "PostgreSQL with Drizzle ORM" \
  --alternatives "MongoDB" "MySQL" \
  --consequences "Requires schema migrations" \
  --tags database storage \
  --status accepted
```

Options: `--context` (required), `--decision`, `--alternatives`, `--consequences`, `--tags`, `--status`, `--supersedes`, `--agent`

### `handoff decisions`

```bash
handoff decisions                    # list all decisions (table)
handoff decisions --search "auth"    # search by keyword
handoff decisions --tag security     # filter by tag
handoff decisions --status accepted  # filter by status
handoff decisions --format json      # machine-readable
handoff decisions show <id>          # show single decision in detail
```

Decisions are stored as YAML files in `.handoff/decisions/{id}.yaml` and included in HANDOFF.md exports via `--include-decisions`.

## Bridge Commands (Agent-to-Agent IPC)

These commands are designed to be called by agents from within their terminal sessions.

### `handoff bridge spawn <agent>`

Open an agent in a new pane adjacent to the current pane.

```bash
handoff bridge spawn codex
handoff bridge spawn gemini --vertical
```

### `handoff bridge message <target> <text>`

Send a message to another agent (auto-prepends `[from: <sender>]`).

```bash
handoff bridge message codex "Review the auth middleware in src/auth.ts"
handoff bridge message gemini "What's the best approach for caching here?"
```

### `handoff bridge read <target> [lines]`

Read the last N lines from a pane.

```bash
handoff bridge read codex 50
handoff bridge read %3 20
```

### `handoff bridge type <target> <text>`

Type literal text into a pane WITHOUT pressing Enter.

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
```

### Other Bridge Commands

```bash
handoff bridge list [--pretty]        # list all panes
handoff bridge id                     # current pane ID + label
handoff bridge resolve <label>        # label -> pane ID
handoff bridge name <target> <label>  # assign label to pane
handoff bridge doctor                 # diagnose tmux connectivity
```

## Workspace Commands

### `handoff start [agents...]`

Launch a tmux workspace with agents in a grid layout.

```bash
handoff start claude codex              # 2 agents + control pane
handoff start claude codex gemini       # 3 agents
handoff start claude --session mywork   # custom session name
```

### Other Workspace Commands

```bash
handoff attach [--session name]  # attach to workspace
handoff add <agent>              # add agent pane dynamically
handoff remove <agent>           # remove agent pane
handoff focus <agent>            # switch tmux focus to pane
handoff layout <style>           # grid | horizontal | vertical | tiled
handoff kill [--force]           # kill workspace session
```

## Setup

```bash
handoff setup
```

Installs `~/.handoff/tmux.conf` with mouse support, pane labels, and keyboard shortcuts.

## Keyboard Shortcuts (after `handoff setup`)

No `Ctrl+B` prefix needed:

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

## HANDOFF.md Protocol (v2.0)

Every exported HANDOFF.md begins with YAML frontmatter:

```yaml
---
handoff_version: "2.0"
session_id: "d4362e6b-2bfe-4239-a18e-cb6c333a039a"
created_at: "2026-03-30T10:00:00Z"
duration: "2h 30m"
working_dir: "/home/user/project"
agent: "claude"
changes:
  modified: 3
  added: 2
  deleted: 0
compression:
  enabled: true
  token_budget: 8000
  tokens_used: 5200
priority_files:
  - "src/auth.ts"
  - "package.json"
decisions_included: 2
---
```

Use `handoff validate` to check compliance and `handoff schema` to get the JSON Schema.

## Configuration

Create `.handoff/config.json` in your project or `~/.handoffrc` for user-level:

```json
{
  "exclude_patterns": ["node_modules", ".git", "dist"],
  "max_diff_lines": 50,
  "compression": {
    "enabled": false,
    "token_budget": 8000,
    "priority_threshold": "low",
    "semantic_analysis": true
  },
  "tmux": {
    "mouse": true,
    "keybindings": true,
    "paneLabels": true
  },
  "agents": {
    "myagent": {
      "command": "myagent --interactive",
      "processName": "myagent"
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
| copilot | `gh copilot` | `.github/copilot-instructions.md` |

## Requirements

- **Node.js** >= 20
- **tmux** -- required for workspace and bridge commands
  - Linux/macOS: install via package manager
  - Windows: install WSL and tmux inside it (Windows Terminal recommended)

## File Structure

```
your-project/
├── HANDOFF.md              # Generated context file (v2.0 spec)
└── .handoff/
    ├── session.json        # File hashes for change detection
    ├── workspace.json      # Active workspace pane mapping
    ├── queries.log         # History of bridge/ask queries
    ├── config.json         # Optional project config
    ├── decisions/          # Decision journal (YAML files)
    │   └── {id}.yaml
    └── snapshots/          # File copies for diffing

~/.handoff/
    ├── tmux.conf           # Generated tmux config
    └── read-guard.json     # Bridge read-guard state
```

## License

MIT
