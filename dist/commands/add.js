import { resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { addAgentToWorkspace } from '../lib/workspace.js';
import { TmuxError, ErrorCode } from '../lib/errors.js';
export function registerAddCommand(program) {
    program
        .command('add <agent>')
        .description('Add a new agent pane to the running workspace.')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (agent, options) => {
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const config = await loadConfig(workingDir);
        await addAgentToWorkspace(agent, workingDir, config);
        console.log(`Added ${agent} to workspace.`);
    });
}
//# sourceMappingURL=add.js.map