# Handoff CLI -- Agent Instructions

## Project Overview

`handoff` is a CLI tool for seamless context transfer and workspace management between AI coding agents (Claude Code, Codex, Gemini CLI, etc.). It enables agents to share memory, communicate via tmux panes, and record architectural decisions.

## Build & Test

```bash
npm run lint    # TypeScript type check (no emit)
npm run build   # Compile TypeScript to dist/
npm test        # Run all tests with vitest
```

Always run all three before committing. Fix any failures before proceeding.

## Architecture

```
src/
  commands/    CLI entry points (Commander.js actions)
  lib/         Pure logic modules (no CLI concerns)
  types/       Central TypeScript types (index.ts)
```

**Key lib modules:**
- `snapshot.ts` -- file hashing, diffing, change detection
- `markdown.ts` -- HANDOFF.md generation with frontmatter
- `compress.ts` -- priority-based diff compression with token budgets
- `semantic.ts` -- regex-based entity extraction from source files
- `semantic-chunker.ts` -- function-level diff chunking (Phase 3)
- `tokens.ts` -- accurate BPE token counting via gpt-tokenizer
- `textrank.ts` -- TextRank extractive summarization (Phase 3)
- `tfidf.ts` -- TF-IDF vectors and cosine similarity (Phase 3)
- `decisions.ts` -- decision journal CRUD + auto-extraction support
- `decision-extractor.ts` -- NLP/regex decision detection from diffs (Phase 2)
- `conversation-monitor.ts` -- agent log monitoring + CLI wrapper (Phase 2)
- `watcher.ts` -- chokidar-based file watching engine (Phase 1)
- `daemon.ts` -- background daemon process management (Phase 1)
- `session.ts` -- shared session load/save helpers
- `ipc.ts` -- file-based cross-platform IPC messaging (Phase 4)
- `context-protocol.ts` -- shared HANDOFF.md context distribution (Phase 4)
- `yaml-lite.ts` -- minimal YAML serializer for Decision type
- `protocol.ts` -- frontmatter parsing and validation
- `schema.ts` -- JSON Schema for frontmatter
- `interop.ts` -- output format conversion (JSON, CLAUDE.md, AGENTS.md)
- `tmux.ts` -- tmux abstraction (WSL-aware on Windows)
- `agents.ts` -- agent registry and detection
- `workspace.ts` -- tmux workspace lifecycle (IPC-aware)
- `config.ts` -- layered config loading (daemon + IPC sections)

## Conventions

- **Runtime dependencies** -- 5 total: commander, diff, ignore, chokidar (file watching), gpt-tokenizer (BPE tokenization). New deps require discussion.
- **ESM throughout** -- all imports use `.js` extensions, `import.meta.url` for file paths
- **No default exports** -- use named exports only
- **Error handling** -- commands call `process.exit(1)` on user errors, `process.exit(2)` on system errors
- **Tests** -- vitest, use `mkdtemp` for temp directories, clean up in `afterEach`
- **Platform** -- tmux commands go through `lib/tmux.ts` which handles WSL on Windows

## File Naming

- Decision YAML: `.handoff/decisions/{id}.yaml`
- Workspace state: `.handoff/workspace.json`
- Session state: `.handoff/session.json`
- File snapshots: `.handoff/snapshots/`
- Config: `.handoff/config.json` or `~/.handoffrc`

## Adding a New Command

1. Create `src/commands/{name}.ts` with `registerXxxCommand(program: Command): void`
2. Register it in `src/index.ts`
3. Add tests in `tests/`
4. Document in README.md
