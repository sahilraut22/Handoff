import { Command } from 'commander';
import { resolve } from 'node:path';
import { isTmuxAvailable, selectPane } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';

export function registerFocusCommand(program: Command): void {
  program
    .command('focus <agent>')
    .description('Switch tmux focus to an agent pane.')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (agent: string, options: { dir?: string }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available.');
        process.exit(1);
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const state = await loadWorkspaceState(workingDir);

      if (!state) {
        console.error("No workspace found. Run 'handoff start' first.");
        process.exit(1);
      }

      const pane = state.panes.find((p) => p.agent_name === agent || p.label === agent);
      if (!pane) {
        console.error(`Agent '${agent}' not found in workspace.`);
        console.error(`Available: ${state.panes.map((p) => p.label).join(', ')}`);
        process.exit(1);
      }

      try {
        selectPane(pane.pane_id);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
