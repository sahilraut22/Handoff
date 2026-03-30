import { Command } from 'commander';
import { isTmuxAvailable, setPaneTitle } from '../lib/tmux.js';
import { TmuxError, ErrorCode } from '../lib/errors.js';

export function registerNameCommand(program: Command): void {
  program
    .command('name <label>')
    .description('Label the current tmux pane for easier addressing.')
    .option('-p, --pane <id>', 'Target a specific pane by ID instead of the current pane')
    .action((label: string, options: { pane?: string }) => {
      if (!isTmuxAvailable()) {
        throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE,
          'tmux is not available. Start a tmux session to use this command.');
      }

      setPaneTitle(label, options.pane);
      console.log(`Pane labeled as '${label}'`);
    });
}
