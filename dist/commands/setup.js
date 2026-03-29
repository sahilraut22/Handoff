import { execSync } from 'node:child_process';
import { installTmuxConfig } from '../lib/tmux-config.js';
import { isTmuxAvailable } from '../lib/tmux.js';
import { loadConfig } from '../lib/config.js';
import { resolve } from 'node:path';
function getTmuxVersion() {
    try {
        const output = execSync('tmux -V', { encoding: 'utf-8' }).trim();
        return output;
    }
    catch {
        return null;
    }
}
function checkCliInPath(cmd) {
    try {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
export function registerSetupCommand(program) {
    program
        .command('setup')
        .description('Install the handoff tmux config and print diagnostics.')
        .option('--no-keybindings', 'Skip Option/Alt-key bindings in config')
        .option('--no-clipboard', 'Skip clipboard integration in config')
        .option('--no-pane-labels', 'Skip pane labels in borders')
        .option('-d, --dir <path>', 'Working directory for config (default: current directory)')
        .action(async (options) => {
        const workingDir = resolve(options.dir ?? process.cwd());
        const handoffConfig = await loadConfig(workingDir);
        console.log('handoff setup\n');
        // 1. Check tmux
        const tmuxOk = isTmuxAvailable();
        const tmuxVersion = getTmuxVersion();
        console.log(`${tmuxOk ? '\u2713' : '\u2717'} tmux: ${tmuxVersion ?? 'not found'}`);
        // 2. Check clipboard tools
        const hasPbcopy = checkCliInPath('pbcopy');
        const hasXclip = checkCliInPath('xclip');
        const hasXsel = checkCliInPath('xsel');
        const clipboardOk = hasPbcopy || hasXclip || hasXsel;
        const clipboardTool = hasPbcopy ? 'pbcopy' : hasXclip ? 'xclip' : hasXsel ? 'xsel' : 'none';
        console.log(`${clipboardOk ? '\u2713' : '\u26a0'} clipboard: ${clipboardTool}${!clipboardOk ? ' (install xclip for Linux clipboard support)' : ''}`);
        // 3. Check handoff in PATH
        const handoffOk = checkCliInPath('handoff');
        console.log(`${handoffOk ? '\u2713' : '\u26a0'} handoff in PATH: ${handoffOk ? 'yes' : 'no (run npm link or add to PATH)'}`);
        // 4. Install tmux config
        console.log('');
        console.log('Installing tmux config...');
        try {
            const configOptions = {
                ...handoffConfig.tmux,
                keybindings: options.keybindings !== false,
                clipboard: options.clipboard !== false,
                paneLabels: options.paneLabels !== false,
            };
            const configPath = await installTmuxConfig(configOptions);
            console.log(`\u2713 Installed: ${configPath}`);
            // Check if tmux is running and offer to reload
            if (tmuxOk) {
                console.log('');
                console.log('To apply the config to your current tmux session, run:');
                console.log(`  tmux source-file ${configPath}`);
            }
        }
        catch (err) {
            console.error(`\u2717 Failed to install config: ${err.message}`);
        }
        // 5. Print keyboard shortcut cheatsheet
        console.log('');
        console.log('Keyboard shortcuts (after config is loaded):');
        console.log('');
        console.log('  Pane navigation (no prefix needed):');
        console.log('    Alt+i   Move to pane above');
        console.log('    Alt+k   Move to pane below');
        console.log('    Alt+j   Move to pane left');
        console.log('    Alt+l   Move to pane right');
        console.log('');
        console.log('  Pane management:');
        console.log('    Alt+n   Split pane (side by side) + auto-tile');
        console.log('    Alt+w   Close current pane');
        console.log('    Alt+o   Cycle layouts');
        console.log('    Alt+g   Mark pane');
        console.log('    Alt+y   Swap with marked pane');
        console.log('');
        console.log('  Windows:');
        console.log('    Alt+u   Next window');
        console.log('    Alt+h   Previous window');
        console.log('    Alt+m   New window');
        console.log('');
        console.log('  Scroll/copy:');
        console.log('    Alt+Tab Toggle scroll mode');
        console.log('    y       Copy selection to clipboard (in scroll mode)');
        // 6. Print agent bridge quick reference
        console.log('');
        console.log('Agent bridge commands (for use inside agents):');
        console.log('  handoff bridge spawn codex         # Open codex side by side');
        console.log('  handoff bridge read codex 50       # Read codex\'s output');
        console.log('  handoff bridge message codex "..."  # Send a message to codex');
        console.log('  handoff bridge keys codex Enter    # Press Enter in codex');
        console.log('  handoff bridge list                # List all panes');
    });
}
//# sourceMappingURL=setup.js.map