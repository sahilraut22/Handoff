# handoff-cli Tutorial

A hands-on walkthrough of every major feature. Follow along in order — each section builds on the last.

---

## Prerequisites

```bash
npm install -g handoff-cli
node --version   # >= 20 required
```

For workspace and bridge commands (agent spawning, IPC via tmux):
```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Windows — install WSL, then inside WSL:
sudo apt install tmux
```

---

## Part 1: Basic Context Transfer

The core loop: snapshot your project, make changes, export a handoff document.

### Step 1 — Create a project and initialize

```bash
mkdir ~/demo-project && cd ~/demo-project
git init
echo '{ "name": "demo", "version": "1.0.0" }' > package.json
mkdir src
echo 'export function greet(name) { return `Hello, ${name}`; }' > src/greet.js
```

Now take a snapshot so handoff knows the starting state:

```bash
handoff init
```

You'll see:
```
Initialized handoff session.
Snapshotted 2 files.
```

This creates `.handoff/session.json` with hashes of every tracked file. Nothing else changes.

### Step 2 — Make some changes

```bash
echo 'export function farewell(name) { return `Goodbye, ${name}`; }' >> src/greet.js
echo 'export const VERSION = "1.0.0";' > src/version.js
```

### Step 3 — Export a HANDOFF.md

```bash
handoff export --message "Added farewell function and version constant"
```

Open `HANDOFF.md` — you'll see:

```markdown
---
handoff_version: "2.0"
session_id: "..."
created_at: "..."
agent: "human"
changes:
  modified: 1
  added: 1
  deleted: 0
---

## Summary
Added farewell function and version constant

## Changes

### src/greet.js (modified)
+export function farewell(name) { return `Goodbye, ${name}`; }

### src/version.js (added)
+export const VERSION = "1.0.0";
```

This file is what the next agent reads to understand what happened.

### Step 4 — Re-initialize for the next session

After handing off, the receiving agent runs `handoff init` again to reset the baseline. Any new `handoff export` will only show changes since that init.

```bash
handoff init
```

---

## Part 2: Compression

When diffs are large, `--compress` uses intelligent prioritization to fit within a token budget.

### Priority tiers

Files are classified automatically:

| Priority | Examples |
|----------|---------|
| `critical` | `package.json`, auth files, `.env`, migrations, CI config |
| `high` | `src/lib/`, API routes, test files, `index.ts`, `server.ts` |
| `medium` | Components, utilities, type definitions |
| `low` | Docs, lockfiles, generated code |

Higher-priority diffs are always included first. Lower-priority diffs are compressed or omitted to stay within budget.

### Try it

```bash
# Generate a lot of changes
for i in $(seq 1 20); do echo "function fn$i() { return $i; }" >> src/greet.js; done
echo "# large doc" > docs/guide.md && for i in $(seq 1 50); do echo "line $i" >> docs/guide.md; done

handoff export --compress
# Default budget: 8000 tokens

handoff export --compress --token-budget 1000
# Tight budget — docs/guide.md will be summarized or dropped
```

The frontmatter shows what happened:
```yaml
compression:
  enabled: true
  token_budget: 1000
  tokens_used: 847
```

### Semantic summaries

When a diff is compressed, handoff shows which functions/classes changed instead of the raw diff:

```
[compressed — changed: fn1, fn3, fn7 in src/greet.js]
```

---

## Part 3: Decision Journal

Record the *why* behind your code, not just the *what*.

### Recording a decision

```bash
handoff decide "Use flat files over a database for decision storage" \
  --context "No database dependency, decisions are append-only, git-friendly" \
  --decision "Store each decision as a YAML file in .handoff/decisions/" \
  --alternatives "SQLite" "JSON single-file" \
  --consequences "No query capability beyond grep; acceptable for current scale" \
  --tags architecture storage \
  --status accepted
```

### Listing decisions

```bash
handoff decisions
```

Output:
```
ID        Title                                      Status    Tags
────────  ─────────────────────────────────────────  ────────  ─────────────────────
a1b2c3d4  Use flat files over a database for deci…  accepted  architecture, storage
```

### Filtering and searching

```bash
handoff decisions --search "database"
handoff decisions --tag architecture
handoff decisions --status accepted
handoff decisions --format json        # machine-readable
```

### Viewing a single decision

```bash
handoff decisions show a1b2c3d4
```

```
Title:        Use flat files over a database for decision storage
Status:       accepted
Tags:         architecture, storage
Context:      No database dependency, decisions are append-only, git-friendly
Decision:     Store each decision as a YAML file in .handoff/decisions/
Alternatives: SQLite, JSON single-file
Consequences: No query capability beyond grep; acceptable for current scale
```

### Including decisions in exports

```bash
handoff export --include-decisions
```

The exported HANDOFF.md gains a `## Decisions` section. The next agent sees not just *what* changed, but *why* you made each choice.

---

## Part 4: Output Formats

Export to different formats depending on who's reading.

```bash
# Default: HANDOFF.md (v2.0 protocol, YAML frontmatter)
handoff export

# JSON — for programmatic consumption
handoff export --format json > handoff.json

# CLAUDE.md snippet — paste into your agent's memory file
handoff export --format claude

# AGENTS.md section — for OpenAI Codex / Agents SDK
handoff export --format agents

# File list only, no diffs
handoff export --no-diff

# Include CLAUDE.md / AGENTS.md / GEMINI.md in the export
handoff export --include-memory
```

### Validating the output

```bash
handoff validate               # validate ./HANDOFF.md
handoff validate path/to/HANDOFF.md
handoff validate --strict      # warnings become errors
```

```bash
handoff schema                 # print JSON Schema for frontmatter
handoff schema --output schema.json
```

---

## Part 5: Background Watcher

`handoff watch` runs a daemon that monitors your files and regenerates `HANDOFF.md` automatically whenever enough changes accumulate.

### Start the watcher

```bash
cd ~/demo-project
handoff watch
```

```
Watcher started (PID: 12345)
Watching: ~/demo-project
Debounce: 2000ms | Threshold: 3 changes
```

The watcher runs in the background. Your terminal is free.

### Trigger an auto-regen

```bash
echo "// change 1" >> src/greet.js
echo "// change 2" >> src/greet.js
echo "// change 3" >> src/greet.js
sleep 3
cat HANDOFF.md   # freshly regenerated
```

After 3 file-change events (the default threshold), the watcher waits for the debounce window (2 seconds of quiet) and then regenerates HANDOFF.md.

### Check status

```bash
handoff watch --status
# running (PID: 12345) | 3 changes tracked | last regen: 5s ago
```

### Custom settings

```bash
handoff watch --debounce 5000 --threshold 5
# Wait 5s of quiet, require 5 changes before regenerating
```

### Run in foreground (for debugging)

```bash
handoff watch --no-detach
# Logs stream to stdout; Ctrl+C to stop
```

### Stop the watcher

```bash
handoff watch --stop
# Watcher stopped
```

### Watcher + export shortcut

When the watcher is running, `handoff export` skips the file scan if the watcher state is fresh (under 5 seconds old). This makes manual exports near-instant during active development.

---

## Part 6: Automatic Decision Extraction

handoff can automatically detect architectural decisions in diffs and commit messages without you writing them manually.

### How it works

After every `handoff export`, the diff is scanned with 10 built-in NLP patterns:

| Pattern | Triggers on |
|---------|------------|
| `architecture-choice` | "decided to use", "chose X", "went with" |
| `breaking-change` | `BREAKING CHANGE:` in diffs/comments |
| `dependency` | "added/removed/upgraded X package" |
| `security` | "added encryption", "sanitize", "auth token" |
| `trade-off` | "instead of", "over", "rather than" |
| `performance` | "optimized", "cache", "lazy load" |
| `api-design` | "endpoint", "REST", "GraphQL" |
| `data-model` | "schema", "migration", "foreign key" |
| `error-handling` | "try/catch", "fallback", "retry" |
| `configuration` | "env var", "feature flag", "config" |

Extracted decisions are staged for review — they don't go into the journal until you approve them.

### Review pending decisions

```bash
handoff decisions review
```

```
1 pending decision extracted from last export:

[1] Use gpt-tokenizer package for accurate token counting  (85% confidence)
    Source: diff | Tags: dependency
    Context: Added gpt-tokenizer package for accurate token counting.

Accept? [y/n/e(dit)/s(kip all)]
```

### Run an agent with automatic extraction

```bash
handoff run claude
```

This launches `claude` as a fully interactive session (your terminal works normally). While the session runs, handoff monitors the agent's log files in the background. When you exit the agent, it scans those logs for decisions and saves any that meet the confidence threshold.

```bash
# Preview what would be saved without writing anything
handoff run claude --dry-run

# Adjust the confidence threshold (default: 0.7)
handoff run claude --min-confidence 0.5
```

> Note: the agent must be installed. `handoff run codex` requires the `codex` CLI to be on your PATH. If it isn't, you'll see a clear "Command not found" error.

---

## Part 7: Cross-Platform IPC

File-based messaging between agents — no tmux required.

### Initialize IPC

```bash
handoff bridge init-ipc
# Creates .handoff/ipc/ directory structure
```

### Register your presence

```bash
handoff bridge heartbeat claude
# Writes a heartbeat file so other agents know you're alive
```

### Check who's online

```bash
handoff bridge presence
```

```
Agent    Status  Last seen
───────  ──────  ─────────
claude   alive   2s ago
codex    alive   8s ago
```

### Send a message

```bash
handoff bridge send codex "Please review src/auth.ts — I changed the JWT expiry logic"
```

### Read your inbox

```bash
handoff bridge inbox codex
```

```
[from: claude | 12s ago]
Please review src/auth.ts — I changed the JWT expiry logic
```

### Context broadcasting

When you run `handoff export`, the generated HANDOFF.md is automatically published to the inbox of every active agent (any agent with a heartbeat under 30 seconds old). Each agent can then pull it:

```bash
handoff bridge context
# Shows the latest published HANDOFF.md from any agent
```

---

## Part 8: Workspace and tmux

Launch multiple agents side-by-side with shared context.

> Requires tmux. See Prerequisites.

### One-time setup

```bash
handoff setup
```

Installs `~/.handoff/tmux.conf` with mouse support, pane labels, and no-prefix keyboard shortcuts.

### Start a workspace

```bash
handoff start claude codex
```

Opens a tmux session with three panes:
```
┌─────────────────┬─────────────────┐
│                 │                 │
│  claude         │  codex          │
│                 │                 │
├─────────────────┴─────────────────┤
│  control                          │
└───────────────────────────────────┘
```

The control pane is yours. Both agents are running and can be messaged via bridge commands.

### Attach to an existing workspace

```bash
handoff attach
handoff attach --session mywork   # named session
```

### Manage panes

```bash
handoff add gemini           # add a third agent pane
handoff remove codex         # close a pane
handoff focus claude         # switch focus to a pane
handoff layout horizontal    # grid | horizontal | vertical | tiled
```

### Send messages between agents

From the control pane:

```bash
handoff bridge message claude "The auth middleware is ready for review in src/auth.ts"
handoff bridge message codex "Please generate tests for src/greet.js"
```

### Read agent output

```bash
handoff bridge read claude 50    # last 50 lines from claude pane
handoff bridge read codex 20
```

### Keyboard shortcuts (after `handoff setup`)

No `Ctrl+B` prefix needed:

| Key | Action |
|-----|--------|
| `Alt+i/k/j/l` | Navigate panes (up/down/left/right) |
| `Alt+n` | New pane (auto-tile) |
| `Alt+w` | Close current pane |
| `Alt+o` | Cycle layouts |
| `Alt+Tab` | Toggle scroll mode |

### Kill the workspace

```bash
handoff kill
handoff kill --force   # skip confirmation
```

---

## Part 9: Configuration

### Project config

Create `.handoff/config.json` in your project root:

```json
{
  "exclude_patterns": ["node_modules", ".git", "dist", "coverage"],
  "max_diff_lines": 80,
  "compression": {
    "enabled": true,
    "token_budget": 6000,
    "priority_threshold": "medium"
  },
  "daemon": {
    "debounce_ms": 3000,
    "change_threshold": 5
  }
}
```

### User config

`~/.handoffrc` applies to all projects:

```json
{
  "agent": "claude",
  "tmux": {
    "mouse": true,
    "keybindings": true,
    "paneLabels": true
  }
}
```

### Custom agents

Register any CLI tool as a handoff-managed agent:

```json
{
  "agents": {
    "mybot": {
      "command": "mybot --interactive",
      "processName": "mybot"
    }
  }
}
```

Then use it like any built-in agent:

```bash
handoff start claude mybot
handoff bridge spawn mybot
```

---

## What's Created in Your Project

```
your-project/
├── HANDOFF.md                  ← generated context file (check this in)
└── .handoff/
    ├── session.json            ← file hashes (do not edit)
    ├── watcher.json            ← watcher state (auto-managed)
    ├── workspace.json          ← pane mapping (auto-managed)
    ├── config.json             ← your project config (optional)
    ├── decisions/
    │   └── {id}.yaml           ← one file per decision (check these in)
    ├── ipc/
    │   ├── inbox/              ← agent message queues
    │   ├── presence/           ← agent heartbeat files
    │   └── context/            ← published HANDOFF.md snapshots
    └── snapshots/              ← file copies for diffing
```

**What to check into git:** `HANDOFF.md` and `.handoff/decisions/`. Everything else is ephemeral.

```gitignore
# Add to .gitignore:
.handoff/session.json
.handoff/watcher.json
.handoff/workspace.json
.handoff/snapshots/
.handoff/ipc/
```

---

## Common Workflows

### Solo development — new session

```bash
handoff init
# ... code ...
handoff export --message "What I did" --include-decisions
# Paste HANDOFF.md into new agent context
```

### Handing off to another agent

```bash
handoff export --compress --include-decisions --include-memory
# Share HANDOFF.md — the other agent reads it to get up to speed instantly
```

### Active development with watcher

```bash
handoff watch              # start background watcher
# ... code freely — HANDOFF.md regenerates automatically ...
handoff watch --stop       # stop when done
```

### Multi-agent collaboration

```bash
handoff start claude codex
handoff bridge init-ipc
handoff bridge heartbeat claude
handoff export             # auto-published to codex inbox
```
