import { resolve } from 'node:path';
import { isTmuxAvailable, hasSession, getSessionPanes, listPanes, setPaneTitle, splitPane, selectLayout, getCurrentPaneId, getPaneInfo, capturePaneLines, capturePane, typeText, sendSpecialKey, } from '../lib/tmux.js';
import { resolveTarget } from '../lib/resolve-target.js';
import { resolveKey } from '../lib/key-map.js';
import { recordRead, checkReadGuard } from '../lib/read-guard.js';
import { getAgentConfig } from '../lib/agents.js';
import { loadWorkspaceState, saveWorkspaceState } from '../lib/workspace.js';
import { loadConfig } from '../lib/config.js';
import { formatTable, formatStatusSymbol } from '../lib/ui.js';
function requireTmux() {
    if (!isTmuxAvailable()) {
        console.error('tmux is not available. Install tmux (or use WSL on Windows) to use bridge commands.');
        process.exit(1);
    }
}
export function registerBridgeCommand(program) {
    const bridge = program
        .command('bridge')
        .description('Low-level IPC bridge for agent-to-agent communication via tmux panes.');
    // bridge list
    bridge
        .command('list')
        .description('List all panes in the handoff session.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('--pretty', 'Display as a formatted table')
        .action((options) => {
        requireTmux();
        const panes = hasSession(options.session)
            ? getSessionPanes(options.session)
            : listPanes();
        if (panes.length === 0) {
            console.log('No panes found.');
            return;
        }
        if (options.pretty) {
            const rows = panes.map((p) => {
                const info = getPaneInfo(p.pane_id);
                const size = info ? `${info.width}x${info.height}` : '-';
                return [
                    p.pane_id,
                    p.pane_title || '-',
                    p.pane_current_command,
                    size,
                    formatStatusSymbol(p.active ? 'active' : 'idle'),
                ];
            });
            console.log(formatTable(['Pane', 'Label', 'Process', 'Size', 'Status'], rows));
        }
        else {
            for (const p of panes) {
                const info = getPaneInfo(p.pane_id);
                const size = info ? `${info.width}x${info.height}` : '-';
                const label = p.pane_title || '-';
                const status = p.active ? 'active' : 'idle';
                console.log(`${p.pane_id} | ${label} | ${p.pane_current_command} | ${size} | ${status}`);
            }
        }
    });
    // bridge read <target> [lines]
    bridge
        .command('read <target> [lines]')
        .description('Read the last N lines from a pane (default: 50). Records a read for the guard system.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('--raw', 'Skip trailing whitespace trimming')
        .action(async (target, linesArg, options) => {
        requireTmux();
        const paneId = resolveTarget(target, options.session);
        const lineCount = linesArg ? parseInt(linesArg, 10) : 50;
        const output = capturePaneLines(paneId, lineCount);
        // Record the read for guard purposes
        try {
            const callerPaneId = getCurrentPaneId();
            await recordRead(callerPaneId, paneId);
        }
        catch {
            // Not inside tmux - skip guard tracking
        }
        console.log(options.raw ? output : output.trimEnd());
    });
    // bridge type <target> <text...>
    bridge
        .command('type <target> <text...>')
        .description('Type literal text into a pane WITHOUT pressing Enter.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('--guard', 'Require a prior read of the target pane before typing')
        .action(async (target, textParts, options) => {
        requireTmux();
        const paneId = resolveTarget(target, options.session);
        if (options.guard) {
            try {
                const callerPaneId = getCurrentPaneId();
                const guardPassed = await checkReadGuard(callerPaneId, paneId);
                if (!guardPassed) {
                    console.error(`Read guard: you must read pane '${target}' before typing to it.`);
                    console.error(`Run: handoff bridge read ${target}`);
                    process.exit(1);
                }
            }
            catch {
                // Not in tmux, skip guard
            }
        }
        const text = textParts.join(' ');
        typeText(paneId, text);
    });
    // bridge keys <target> <key...>
    bridge
        .command('keys <target> <key...>')
        .description('Send special key(s) to a pane (Enter, Escape, Ctrl+C, Tab, Up, Down, etc.).')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .action((target, keyNames, options) => {
        requireTmux();
        const paneId = resolveTarget(target, options.session);
        const resolvedKeys = keyNames.map(resolveKey);
        sendSpecialKey(paneId, ...resolvedKeys);
    });
    // bridge message <target> <text...>
    bridge
        .command('message <target> <text...>')
        .description('Send a message to another agent pane with auto-prepended sender metadata.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('--from <label>', 'Override sender label (default: current pane title or ID)')
        .action((target, textParts, options) => {
        requireTmux();
        const paneId = resolveTarget(target, options.session);
        // Determine sender identity
        let senderLabel = options.from;
        if (!senderLabel) {
            try {
                const currentPaneId = getCurrentPaneId();
                const panes = listPanes();
                const currentPane = panes.find((p) => p.pane_id === currentPaneId);
                senderLabel = currentPane?.pane_title || currentPaneId;
            }
            catch {
                senderLabel = 'unknown';
            }
        }
        const text = textParts.join(' ');
        const formatted = `[from: ${senderLabel}] ${text}`;
        typeText(paneId, formatted);
        sendSpecialKey(paneId, 'Enter');
    });
    // bridge spawn <agent>
    bridge
        .command('spawn <agent>')
        .description('Spawn an agent in a new pane adjacent to the current pane.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('-d, --dir <path>', 'Working directory for the new pane')
        .option('--horizontal', 'Split horizontally (side-by-side, default)')
        .option('--vertical', 'Split vertically (top-bottom)')
        .action(async (agentName, options) => {
        requireTmux();
        const workingDir = resolve(options.dir ?? process.cwd());
        const config = await loadConfig(workingDir);
        const agentConfig = getAgentConfig(agentName, config.agents);
        if (!agentConfig) {
            console.error(`Unknown agent '${agentName}'. Use a known agent or add it to .handoff/config.json.`);
            console.error(`Known agents: claude, codex, gemini, aider, cursor, copilot`);
            process.exit(1);
        }
        // Find current pane to split from
        let sourcePaneId;
        try {
            sourcePaneId = getCurrentPaneId();
        }
        catch {
            // Not inside tmux pane - use first pane of session
            const sessionPanes = getSessionPanes(options.session);
            if (sessionPanes.length === 0) {
                console.error(`No panes found in session '${options.session}'.`);
                process.exit(1);
            }
            sourcePaneId = sessionPanes[0].pane_id;
        }
        // Split: default horizontal (side-by-side)
        const horizontal = !options.vertical;
        const newPaneId = splitPane(sourcePaneId, { horizontal, startDir: workingDir });
        // Label the new pane
        setPaneTitle(agentName, newPaneId);
        // Start the agent
        typeText(newPaneId, agentConfig.command);
        sendSpecialKey(newPaneId, 'Enter');
        // Re-apply tiled layout if multiple panes
        try {
            selectLayout('tiled', options.session);
        }
        catch {
            // Non-fatal
        }
        // Update workspace state if it exists
        try {
            const state = await loadWorkspaceState(workingDir);
            if (state) {
                const newPane = { agent_name: agentName, pane_id: newPaneId, label: agentName };
                state.panes.push(newPane);
                await saveWorkspaceState(workingDir, state);
            }
        }
        catch {
            // No workspace state, that's fine
        }
        console.log(newPaneId);
    });
    // bridge name <target> <label>
    bridge
        .command('name <target> <label>')
        .description('Assign a label to a pane.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .option('-d, --dir <path>', 'Working directory for workspace state update')
        .action(async (target, label, options) => {
        requireTmux();
        const paneId = resolveTarget(target, options.session);
        setPaneTitle(label, paneId);
        // Update workspace state if present
        if (options.dir) {
            try {
                const state = await loadWorkspaceState(resolve(options.dir));
                if (state) {
                    const pane = state.panes.find((p) => p.pane_id === paneId);
                    if (pane) {
                        pane.label = label;
                        await saveWorkspaceState(resolve(options.dir), state);
                    }
                }
            }
            catch {
                // Non-fatal
            }
        }
        console.log(`Pane ${paneId} labeled as '${label}'.`);
    });
    // bridge resolve <label>
    bridge
        .command('resolve <label>')
        .description('Resolve a pane label to its pane ID.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .action((label, options) => {
        requireTmux();
        try {
            const paneId = resolveTarget(label, options.session);
            console.log(paneId);
        }
        catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
    // bridge id
    bridge
        .command('id')
        .description('Print the current pane\'s ID and label.')
        .action(() => {
        requireTmux();
        try {
            const paneId = getCurrentPaneId();
            const panes = listPanes();
            const currentPane = panes.find((p) => p.pane_id === paneId);
            const label = currentPane?.pane_title;
            if (label) {
                console.log(`${paneId} (${label})`);
            }
            else {
                console.log(paneId);
            }
        }
        catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    });
    // bridge doctor
    bridge
        .command('doctor')
        .description('Diagnose tmux connectivity and bridge health.')
        .option('-s, --session <name>', 'tmux session name', 'handoff')
        .action((options) => {
        const checks = [];
        // 1. tmux availability
        const tmuxOk = isTmuxAvailable();
        checks.push({ label: 'tmux available', pass: tmuxOk });
        if (tmuxOk) {
            // 2. Session exists
            const sessionOk = hasSession(options.session);
            checks.push({ label: `session '${options.session}' exists`, pass: sessionOk });
            if (sessionOk) {
                // 3. Pane listing
                const panes = getSessionPanes(options.session);
                checks.push({ label: 'panes accessible', pass: panes.length > 0, detail: `${panes.length} panes` });
                // 4. Current pane detection
                try {
                    const currentPaneId = getCurrentPaneId();
                    checks.push({ label: 'current pane detectable', pass: true, detail: currentPaneId });
                }
                catch {
                    checks.push({ label: 'current pane detectable', pass: false, detail: '$TMUX_PANE not set' });
                }
                // 5. Capture test
                if (panes.length > 0) {
                    const captured = capturePane(panes[0].pane_id);
                    checks.push({ label: 'pane capture works', pass: captured !== undefined, detail: `${captured.length} chars` });
                }
            }
        }
        // Print results
        for (const check of checks) {
            const icon = check.pass ? '\u2713' : '\u2717';
            const detail = check.detail ? ` (${check.detail})` : '';
            console.log(`${icon} ${check.label}${detail}`);
        }
        const allPassed = checks.every((c) => c.pass);
        if (!allPassed) {
            console.log('');
            console.log('Some checks failed. Try: handoff start claude codex');
            process.exit(1);
        }
    });
}
//# sourceMappingURL=bridge.js.map