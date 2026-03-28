import { Command } from 'commander';
import { resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { removeAgentFromWorkspace } from '../lib/workspace.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <agent>')
    .description('Remove an agent pane from the workspace.')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (agent: string, options: { dir?: string }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available.');
        process.exit(1);
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const config = await loadConfig(workingDir);

      try {
        await removeAgentFromWorkspace(agent, workingDir, config);
        console.log(`Removed ${agent} from workspace.`);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
