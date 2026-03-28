import { Command } from 'commander';
import { isTmuxAvailable, hasSession, attachSession } from '../lib/tmux.js';

export function registerAttachCommand(program: Command): void {
  program
    .command('attach')
    .description('Attach to an existing handoff workspace session.')
    .option('-s, --session <name>', 'tmux session name', 'handoff')
    .action((options: { session: string }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available.');
        process.exit(1);
      }

      if (!hasSession(options.session)) {
        console.error(`Session '${options.session}' not found. Run 'handoff start' to create one.`);
        process.exit(1);
      }

      try {
        attachSession(options.session);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
