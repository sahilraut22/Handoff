import { isTmuxAvailable, setPaneTitle } from '../lib/tmux.js';
export function registerNameCommand(program) {
    program
        .command('name <label>')
        .description('Label the current tmux pane for easier addressing.')
        .option('-p, --pane <id>', 'Target a specific pane by ID instead of the current pane')
        .action((label, options) => {
        if (!isTmuxAvailable()) {
            console.error('tmux is not available. Start a tmux session to use this command.');
            process.exit(1);
        }
        setPaneTitle(label, options.pane);
        console.log(`Pane labeled as '${label}'`);
    });
}
//# sourceMappingURL=name.js.map