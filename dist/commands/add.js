import { resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { addAgentToWorkspace } from '../lib/workspace.js';
export function registerAddCommand(program) {
    program
        .command('add <agent>')
        .description('Add a new agent pane to the running workspace.')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (agent, options) => {
        if (!isTmuxAvailable()) {
            console.error('tmux is not available.');
            process.exit(1);
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const config = await loadConfig(workingDir);
        try {
            await addAgentToWorkspace(agent, workingDir, config);
            console.log(`Added ${agent} to workspace.`);
        }
        catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=add.js.map