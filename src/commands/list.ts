import { Command } from 'commander';
import { listPanes, isTmuxAvailable } from '../lib/tmux.js';
import { detectAgents } from '../lib/agents.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all detected agent panes in tmux.')
    .action(() => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available. Start a tmux session to use this command.');
        process.exit(1);
      }

      const panes = listPanes();
      if (panes.length === 0) {
        console.log('No tmux panes found.');
        return;
      }

      const agents = detectAgents(panes);
      const agentMap = new Map(agents.map((a) => [a.pane.pane_id, a]));

      const header = `${'PANE'.padEnd(8)} ${'LABEL'.padEnd(16)} ${'PROCESS'.padEnd(16)} ${'AGENT'.padEnd(10)} STATUS`;
      const divider = '-'.repeat(header.length);
      console.log(header);
      console.log(divider);

      for (const pane of panes) {
        const agent = agentMap.get(pane.pane_id);
        const label = pane.pane_title || '-';
        const agentName = agent?.name ?? '-';
        const status = pane.active ? 'active' : 'idle';

        console.log(
          `${pane.pane_id.padEnd(8)} ${label.padEnd(16)} ${pane.pane_current_command.padEnd(16)} ${agentName.padEnd(10)} ${status}`
        );
      }
    });
}
