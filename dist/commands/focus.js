import { resolve } from 'node:path';
import { isTmuxAvailable, selectPane } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';
import { TmuxError, SessionError, AgentError, ErrorCode } from '../lib/errors.js';
export function registerFocusCommand(program) {
    program
        .command('focus <agent>')
        .description('Switch tmux focus to an agent pane.')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (agent, options) => {
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const state = await loadWorkspaceState(workingDir);
        if (!state) {
            throw new SessionError(ErrorCode.SESSION_NOT_FOUND, "No workspace found.", { recoveryHint: "Run 'handoff start' first." });
        }
        const pane = state.panes.find((p) => p.agent_name === agent || p.label === agent);
        if (!pane) {
            throw new AgentError(ErrorCode.AGENT_NOT_FOUND, `Agent '${agent}' not found in workspace.`, { recoveryHint: `Available: ${state.panes.map((p) => p.label).join(', ')}` });
        }
        selectPane(pane.pane_id);
    });
}
//# sourceMappingURL=focus.js.map