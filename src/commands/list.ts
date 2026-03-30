import { Command } from 'commander';
import { listPanes, isTmuxAvailable } from '../lib/tmux.js';
import { detectAgents } from '../lib/agents.js';
import { formatTable, formatStatusSymbol } from '../lib/ui.js';
import { loadWorkspaceState } from '../lib/workspace.js';
import { resolve } from 'node:path';
import { TmuxError, ErrorCode } from '../lib/errors.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all detected agent panes in tmux.')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (options: { dir?: string }) => {
      if (!isTmuxAvailable()) {
        throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE,
          'tmux is not available. Start a tmux session to use this command.');
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const state = await loadWorkspaceState(workingDir);

      const panes = listPanes();
      if (panes.length === 0) {
        console.log('No tmux panes found.');
        return;
      }

      const agents = detectAgents(panes);
      const agentMap = new Map(agents.map((a) => [a.pane.pane_id, a]));

      // Header
      if (state) {
        console.log(`Workspace session: ${state.session_name}`);
        console.log('');
      }

      const headers = ['Pane', 'Label', 'Process', 'Agent', 'Status'];
      const rows = panes.map((pane) => {
        const agent = agentMap.get(pane.pane_id);
        const label = pane.pane_title || '-';
        const agentName = agent?.name ?? '-';
        const statusStr = pane.active ? 'active' : 'idle';
        return [pane.pane_id, label, pane.pane_current_command, agentName, formatStatusSymbol(statusStr as 'active' | 'idle')];
      });

      console.log(formatTable(headers, rows));
      console.log('');
      console.log('Commands: handoff ask <agent> "..." | handoff focus <agent> | handoff add <agent>');
    });
}
