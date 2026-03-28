import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles } from '../lib/snapshot.js';
import { isTmuxAvailable, listPanes } from '../lib/tmux.js';
import { detectAgents } from '../lib/agents.js';
import { formatDuration } from '../lib/markdown.js';
import type { Session } from '../types/index.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current session status.')
    .option('-d, --dir <path>', 'Target directory (default: current directory)')
    .action(async (options: { dir?: string }) => {
      const workingDir = resolve(options.dir ?? process.cwd());
      const handoffDir = join(workingDir, '.handoff');

      // Read session
      let session: Session;
      try {
        const content = await readFile(join(handoffDir, 'session.json'), 'utf-8');
        session = JSON.parse(content) as Session;
      } catch {
        console.error('No active session. Run `handoff init` first.');
        process.exit(1);
      }

      const config = await loadConfig(workingDir);

      // Count changes
      const currentFiles = await walkFiles(workingDir, config.exclude_patterns);
      const currentHashes = await hashAllFiles(workingDir, currentFiles);
      const oldHashes = session.file_hashes;

      let modified = 0, added = 0, deleted = 0;
      for (const f of Object.keys(oldHashes)) {
        if (!(f in currentHashes)) deleted++;
      }
      for (const f of Object.keys(currentHashes)) {
        if (!(f in oldHashes)) added++;
        else if (currentHashes[f] !== oldHashes[f]) modified++;
      }

      // Print session info
      const duration = formatDuration(session.created_at);
      console.log(`Session:     ${session.session_id}`);
      console.log(`Started:     ${session.created_at} (${duration} ago)`);
      console.log(`Working Dir: ${session.working_dir}`);
      console.log(`Tracking:    ${Object.keys(oldHashes).length} files`);
      console.log('');
      console.log('Changes since init:');
      console.log(`  Modified: ${modified} files`);
      console.log(`  Added:    ${added} files`);
      console.log(`  Deleted:  ${deleted} files`);

      if (session.last_export) {
        const exportDuration = formatDuration(session.last_export);
        console.log('');
        console.log(`Last export: ${session.last_export} (${exportDuration} ago)`);
      }

      if (session.last_query) {
        const q = session.last_query;
        const queryDuration = formatDuration(q.timestamp);
        console.log(`Last query:  ${q.agent} - "${q.question.slice(0, 60)}" (${queryDuration} ago)`);
      }

      // Show agents if tmux is available
      if (isTmuxAvailable()) {
        const panes = listPanes();
        const agents = detectAgents(panes);
        if (agents.length > 0) {
          console.log('');
          console.log('Active agents:');
          for (const agent of agents) {
            const labelStr = agent.label ? `, label: ${agent.label}` : '';
            console.log(`  ${agent.name} (pane ${agent.pane.pane_id}${labelStr})`);
          }
        }
      } else {
        console.log('');
        console.log('(tmux not available - agent detection skipped)');
      }
    });
}
