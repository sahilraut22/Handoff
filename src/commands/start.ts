import { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { createWorkspace } from '../lib/workspace.js';
import { installTmuxConfig } from '../lib/tmux-config.js';

export function registerStartCommand(program: Command): void {
  program
    .command('start [agents...]')
    .description('Launch a tmux workspace with the specified agents in a grid layout.')
    .option('-s, --session <name>', 'tmux session name', 'handoff')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .option('--no-config', 'Skip installing/loading the handoff tmux config')
    .action(async (agents: string[], options: { session: string; dir?: string; config: boolean }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available. Install tmux (or use WSL on Windows) to use this command.');
        process.exit(1);
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      await mkdir(join(workingDir, '.handoff'), { recursive: true });

      const handoffConfig = await loadConfig(workingDir);

      const agentList = agents.filter(Boolean);
      if (agentList.length > 0) {
        console.log(`Starting workspace with agents: ${agentList.join(', ')}`);
      } else {
        console.log('Starting workspace (control pane only)...');
      }

      // Install tmux config (keyboard bindings, mouse, pane labels)
      let tmuxConfigPath: string | undefined;
      if (options.config !== false) {
        try {
          tmuxConfigPath = await installTmuxConfig(handoffConfig.tmux);
        } catch {
          // Non-fatal - proceed without custom config
        }
      }

      try {
        await createWorkspace(agentList, workingDir, handoffConfig, {
          sessionName: options.session,
          tmuxConfigPath,
        });
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
