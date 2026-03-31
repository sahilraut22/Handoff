import { Command } from 'commander';
import { resolve } from 'node:path';
import { isTmuxAvailable, hasSession, getSessionPanes, setPaneTitle } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';
import { TmuxError, SessionError, ErrorCode } from '../lib/errors.js';

export function registerRelabelCommand(program: Command): void {
  program
    .command('relabel')
    .description('Reapply saved workspace pane labels to the running tmux session.')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .option('-s, --session <name>', 'tmux session name (default: workspace session)')
    .action(async (options: { dir?: string; session?: string }) => {
      if (!isTmuxAvailable()) {
        throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const state = await loadWorkspaceState(workingDir);
      if (!state) {
        throw new SessionError(
          ErrorCode.SESSION_NOT_FOUND,
          "No workspace found.",
          { recoveryHint: "Run 'handoff start' first." }
        );
      }

      const sessionName = options.session ?? state.session_name;
      if (!hasSession(sessionName)) {
        throw new TmuxError(
          ErrorCode.TMUX_SESSION_NOT_FOUND,
          `Session '${sessionName}' is not running.`,
          { recoveryHint: "Run 'handoff attach' or start a new workspace with 'handoff start'." }
        );
      }

      const livePaneIds = new Set(getSessionPanes(sessionName).map((p) => p.pane_id));
      let updated = 0;
      const missing: string[] = [];

      for (const pane of state.panes) {
        const label = pane.label || pane.agent_name;
        if (!label) continue;
        if (!livePaneIds.has(pane.pane_id)) {
          missing.push(`${pane.pane_id} (${label})`);
          continue;
        }
        setPaneTitle(label, pane.pane_id);
        updated++;
      }

      console.log(`Reapplied ${updated} pane label(s) in session '${sessionName}'.`);
      if (missing.length > 0) {
        console.log(`Skipped missing panes: ${missing.join(', ')}`);
      }
    });
}
