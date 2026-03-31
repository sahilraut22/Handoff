#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const distCli = join(repoRoot, 'dist', 'index.js');
const cli = existsSync(distCli)
  ? { command: process.execPath, baseArgs: [distCli] }
  : { command: 'handoff', baseArgs: [] };

const args = process.argv.slice(2);
let session = 'handoff';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--session' && args[i + 1]) {
    session = args[i + 1];
    i++;
  }
}

function runHandoff(handoffArgs) {
  const fullArgs = [...cli.baseArgs, ...handoffArgs];
  const rendered = [cli.command, ...fullArgs].join(' ');
  console.log(`\n$ ${rendered}`);

  const result = spawnSync(cli.command, fullArgs, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('tmux visible chat demo');
console.log(`Session: ${session}`);
console.log('This sends messages directly into live claude/codex panes.');

runHandoff(['bridge', 'doctor', '-s', session]);
runHandoff(['bridge', 'message', 'codex', 'Hi Codex, please summarize your current task in 2 bullets.', '-s', session, '--from', 'claude']);
runHandoff(['bridge', 'message', 'claude', 'Hi Claude, please review src/lib/tmux-config.ts for risks.', '-s', session, '--from', 'codex']);

console.log('\nMessages injected. You should now see both prompts in the tmux panes.');
console.log('Tip: switch panes and watch each agent respond in place.');
