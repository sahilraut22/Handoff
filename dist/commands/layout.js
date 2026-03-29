import { resolve } from 'node:path';
import { isTmuxAvailable, selectLayout } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';
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
            console.error('tmux is not available.');
            process.exit(1);
        }
        const tmuxLayout = LAYOUT_MAP[style];
        if (!tmuxLayout) {
            console.error(`Unknown layout style '${style}'. Choose from: ${Object.keys(LAYOUT_MAP).join(', ')}`);
            process.exit(1);
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const state = await loadWorkspaceState(workingDir);
        const sessionName = state?.session_name ?? 'handoff';
        try {
            selectLayout(tmuxLayout, sessionName);
            console.log(`Layout changed to '${style}'.`);
        }
        catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=layout.js.map