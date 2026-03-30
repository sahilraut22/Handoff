import { Command } from 'commander';
import { resolve } from 'node:path';
import { isTmuxAvailable, hasSession } from '../lib/tmux.js';
import { destroyWorkspace, loadWorkspaceState } from '../lib/workspace.js';
import { TmuxError, HandoffValidationError, ErrorCode } from '../lib/errors.js';

export function registerKillCommand(program: Command): void {
  program
    .command('kill')
    .description('Kill the handoff workspace session.')
    .option('-s, --session <name>', 'tmux session name (default: from workspace state or "handoff")')
    .option('-f, --force', 'Skip confirmation')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (options: { session?: string; force?: boolean; dir?: string }) => {
      if (!isTmuxAvailable()) {
        throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const state = await loadWorkspaceState(workingDir);
      const sessionName = options.session ?? state?.session_name ?? 'handoff';

      if (!hasSession(sessionName)) {
        throw new TmuxError(ErrorCode.TMUX_SESSION_NOT_FOUND,
          `Session '${sessionName}' is not running.`);
      }

      if (!options.force) {
        throw new HandoffValidationError(ErrorCode.VALIDATION_FAILED,
          `Session '${sessionName}' will be destroyed.`,
          { recoveryHint: 'Use --force to confirm.' });
      }

      await destroyWorkspace(workingDir, { sessionName });
      console.log(`Session '${sessionName}' killed.`);
    });
}
