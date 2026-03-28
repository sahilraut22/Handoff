import { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { createWorkspace } from '../lib/workspace.js';

export function registerStartCommand(program: Command): void {
  program
    .command('start [agents...]')
    .description('Launch a tmux workspace with the specified agents in a grid layout.')
    .option('-s, --session <name>', 'tmux session name', 'handoff')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (agents: string[], options: { session: string; dir?: string }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available. Install tmux (or use WSL on Windows) to use this command.');
        process.exit(1);
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      await mkdir(join(workingDir, '.handoff'), { recursive: true });

      const config = await loadConfig(workingDir);

      const agentList = agents.filter(Boolean);
      if (agentList.length > 0) {
        console.log(`Starting workspace with agents: ${agentList.join(', ')}`);
      } else {
        console.log('Starting workspace (control pane only)...');
      }

      try {
        await createWorkspace(agentList, workingDir, config, { sessionName: options.session });
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
