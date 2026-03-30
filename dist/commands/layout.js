import { resolve } from 'node:path';
import { isTmuxAvailable, selectLayout } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';
import { TmuxError, HandoffValidationError, ErrorCode } from '../lib/errors.js';
const LAYOUT_MAP = {
    grid: 'tiled',
    horizontal: 'even-horizontal',
    vertical: 'even-vertical',
    tiled: 'tiled',
};
export function registerLayoutCommand(program) {
    program
        .command('layout <style>')
        .description('Change the workspace pane layout. Styles: grid, horizontal, vertical, tiled')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (style, options) => {
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
        }
        const tmuxLayout = LAYOUT_MAP[style];
        if (!tmuxLayout) {
            throw new HandoffValidationError(ErrorCode.INVALID_FORMAT, `Unknown layout style '${style}'.`, { recoveryHint: `Choose from: ${Object.keys(LAYOUT_MAP).join(', ')}` });
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const state = await loadWorkspaceState(workingDir);
        const sessionName = state?.session_name ?? 'handoff';
        selectLayout(tmuxLayout, sessionName);
        console.log(`Layout changed to '${style}'.`);
    });
}
//# sourceMappingURL=layout.js.map