import { isTmuxAvailable, hasSession, attachSession } from '../lib/tmux.js';
import { TmuxError, ErrorCode } from '../lib/errors.js';
export function registerAttachCommand(program) {
    program
        .command('attach')
        .description('Attach to an existing handoff workspace session.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .action((options) => {
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available.');
        }
        if (!hasSession(options.session)) {
            throw new TmuxError(ErrorCode.TMUX_SESSION_NOT_FOUND, `Session '${options.session}' not found.`);
        }
        attachSession(options.session);
    });
}
//# sourceMappingURL=attach.js.map