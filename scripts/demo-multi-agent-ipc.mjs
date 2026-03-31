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
let workingDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    workingDir = resolve(args[i + 1]);
    i++;
  }
}

function runHandoff(handoffArgs) {
  const fullArgs = [...cli.baseArgs, ...handoffArgs];
  const rendered = [cli.command, ...fullArgs].join(' ');
  console.log(`\n$ ${rendered}`);

  const result = spawnSync(cli.command, fullArgs, {
    cwd: workingDir,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Multi-agent IPC demo');
console.log(`Working directory: ${workingDir}`);
console.log('Goal: simulate Claude and Codex exchanging messages without manual handoff command typing.');

runHandoff(['bridge', 'init-ipc', '-d', workingDir]);
runHandoff(['bridge', 'heartbeat', 'claude', '-d', workingDir]);
runHandoff(['bridge', 'heartbeat', 'codex', '-d', workingDir]);

runHandoff([
  'bridge',
  'send',
  'codex',
  'Please review src/lib/workspace.ts and share any risk.',
  '-d',
  workingDir,
  '--from',
  'claude',
]);

runHandoff([
  'bridge',
  'send',
  'claude',
  'Reviewed. Main risk is pane title drift; fix is in tmux config defaults.',
  '-d',
  workingDir,
  '--from',
  'codex',
]);

console.log('\nCodex inbox:');
runHandoff(['bridge', 'inbox', 'codex', '-d', workingDir, '--delete']);

console.log('\nClaude inbox:');
runHandoff(['bridge', 'inbox', 'claude', '-d', workingDir, '--delete']);

console.log('\nDemo completed successfully.');
