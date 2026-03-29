import { resolve } from 'node:path';
import { isTmuxAvailable, hasSession } from '../lib/tmux.js';
import { destroyWorkspace, loadWorkspaceState } from '../lib/workspace.js';
export function registerKillCommand(program) {
    program
        .command('kill')
        .description('Kill the handoff workspace session.')
        .option('-s, --session <name>', 'tmux session name (default: from workspace state or "handoff")')
        .option('-f, --force', 'Skip confirmation')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (options) => {
        if (!isTmuxAvailable()) {
            console.error('tmux is not available.');
            process.exit(1);
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const state = await loadWorkspaceState(workingDir);
        const sessionName = options.session ?? state?.session_name ?? 'handoff';
        if (!hasSession(sessionName)) {
            console.error(`Session '${sessionName}' is not running.`);
            process.exit(1);
        }
        if (!options.force) {
            console.error(`Session '${sessionName}' will be destroyed. Use --force to confirm.`);
            process.exit(1);
        }
        try {
            await destroyWorkspace(workingDir, { sessionName });
            console.log(`Session '${sessionName}' killed.`);
        }
        catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=kill.js.map