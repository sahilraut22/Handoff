import { resolve } from 'node:path';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { removeAgentFromWorkspace } from '../lib/workspace.js';
import { TmuxError, ErrorCode } from '../lib/errors.js';
export function registerRemoveCommand(program) {
    program
        .command('remove <agent>')
        .description('Remove an agent pane from the workspace.')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .action(async (agent, options) => {
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
        }
        const workingDir = resolve(options.dir ?? process.cwd());
        const config = await loadConfig(workingDir);
        await removeAgentFromWorkspace(agent, workingDir, config);
        console.log(`Removed ${agent} from workspace.`);
    });
}
//# sourceMappingURL=remove.js.map