import { execFileSync } from 'node:child_process';
function runTmux(args) {
    try {
        if (process.platform === 'win32') {
            // Build the command via `wsl bash -c` so that:
            // 1. We bypass cmd.exe shell interpretation entirely
            // 2. Each arg is JSON.stringify'd so bash receives them correctly quoted
            //    (handles #{} format strings, spaces, pipes, special chars)
            const cmd = ['tmux', ...args].map((a) => JSON.stringify(a)).join(' ');
            return execFileSync('wsl', ['bash', '-c', cmd], {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        }
        return execFileSync('tmux', args, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    }
    catch (err) {
        const error = err;
        if (error.code === 'ENOENT') {
            throw new Error('tmux is not installed or not found in PATH.');
        }
        throw new Error(`tmux command failed: ${err.message}`);
    }
}
function runTmuxInteractive(args) {
    try {
        if (process.platform === 'win32') {
            const cmd = ['tmux', ...args].map((a) => JSON.stringify(a)).join(' ');
            execFileSync('wsl', ['bash', '-c', cmd], { stdio: 'inherit' });
        }
        else {
            execFileSync('tmux', args, { stdio: 'inherit' });
        }
    }
    catch (err) {
        const error = err;
        if (error.code === 'ENOENT') {
            throw new Error('tmux is not installed or not found in PATH.');
        }
        // Interactive commands may exit with non-zero on normal detach, ignore those
    }
}
export function isTmuxAvailable() {
    try {
        // `tmux info` exits 1 with "no current client" when called outside an
        // attached session (always the case on Windows). Use `list-sessions`
        // instead — it exits 0 if the tmux server is running, 1 only if it isn't.
        runTmux(['list-sessions']);
        return true;
    }
    catch {
        return false;
    }
}
function parsePane(line) {
    const parts = line.split('|');
    if (parts.length < 7)
        return null;
    const [pane_id, pane_title, pane_pid, pane_current_command, window_name, session_name, active_str] = parts;
    return {
        pane_id: pane_id.trim(),
        pane_title: pane_title.trim(),
        pane_pid: pane_pid.trim(),
        pane_current_command: pane_current_command.trim(),
        window_name: window_name.trim(),
        session_name: session_name.trim(),
        active: active_str.trim() === '1',
    };
}
const PANE_FORMAT = '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_current_command}|#{window_name}|#{session_name}|#{pane_active}';
export function listPanes() {
    const output = runTmux(['list-panes', '-a', '-F', PANE_FORMAT]);
    return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(parsePane)
        .filter((p) => p !== null);
}
export function findPane(identifier) {
    const panes = listPanes();
    return panes.find((p) => p.pane_id === identifier ||
        p.pane_title === identifier ||
        p.window_name === identifier);
}
export function setPaneTitle(title, paneId) {
    // Store a dedicated immutable label for handoff UI rendering.
    // This avoids shell/TUI title escape sequences mutating visible agent labels.
    const optionArgs = paneId
        ? ['set-option', '-pt', paneId, '@handoff_label', title]
        : ['set-option', '-p', '@handoff_label', title];
    runTmux(optionArgs);
    const args = ['select-pane', '-T', title];
    if (paneId) {
        args.push('-t', paneId);
    }
    runTmux(args);
}
export function sendKeys(paneId, text) {
    runTmux(['send-keys', '-t', paneId, text, 'Enter']);
}
export function capturePane(paneId) {
    try {
        return runTmux(['capture-pane', '-p', '-t', paneId]);
    }
    catch {
        return '';
    }
}
export async function waitForResponse(paneId, timeoutMs, pollIntervalMs = 200) {
    const baseline = capturePane(paneId);
    const start = Date.now();
    let prevContent = baseline;
    let stableCount = 0;
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const current = capturePane(paneId);
            if (Date.now() - start >= timeoutMs) {
                clearInterval(interval);
                resolve(current !== baseline ? current.slice(baseline.length).trim() : current.trim());
                return;
            }
            if (current !== prevContent) {
                // Content changed — reset stable counter and track new content
                stableCount = 0;
                prevContent = current;
            }
            else if (current !== baseline) {
                // Content is stable and different from baseline — count consecutive stable polls
                stableCount++;
                if (stableCount >= 3) {
                    // Stable for 3 polls (600ms) — response is complete
                    clearInterval(interval);
                    resolve(current.slice(baseline.length).trim());
                }
            }
        }, pollIntervalMs);
    });
}
// --- New workspace management functions ---
export function hasSession(name) {
    try {
        runTmux(['has-session', '-t', name]);
        return true;
    }
    catch {
        return false;
    }
}
export function newSession(name, options) {
    const args = ['new-session', '-s', name, '-P', '-F', '#{pane_id}'];
    if (options?.detached !== false) {
        args.push('-d');
    }
    if (options?.startDir) {
        args.push('-c', options.startDir);
    }
    return runTmux(args).trim();
}
export function splitPane(targetPane, options) {
    const args = ['split-window', '-t', targetPane, '-P', '-F', '#{pane_id}'];
    if (options?.horizontal) {
        args.push('-h');
    }
    if (options?.startDir) {
        args.push('-c', options.startDir);
    }
    return runTmux(args).trim();
}
export function killPane(paneId) {
    runTmux(['kill-pane', '-t', paneId]);
}
export function killSession(name) {
    runTmux(['kill-session', '-t', name]);
}
export function selectPane(paneId) {
    runTmux(['select-pane', '-t', paneId]);
}
export function selectLayout(layout, targetWindow) {
    const args = ['select-layout'];
    if (targetWindow) {
        args.push('-t', targetWindow);
    }
    args.push(layout);
    runTmux(args);
}
export function attachSession(name) {
    if (process.env.TMUX) {
        // Already inside tmux - switch client instead of attach
        runTmux(['switch-client', '-t', name]);
    }
    else {
        runTmuxInteractive(['attach-session', '-t', name]);
    }
}
export function getSessionPanes(sessionName) {
    try {
        const output = runTmux(['list-panes', '-s', '-t', sessionName, '-F', PANE_FORMAT]);
        return output
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(parsePane)
            .filter((p) => p !== null);
    }
    catch {
        return [];
    }
}
export function resizePane(paneId, options) {
    if (options.height !== undefined) {
        runTmux(['resize-pane', '-t', paneId, '-y', String(options.height)]);
    }
    if (options.width !== undefined) {
        runTmux(['resize-pane', '-t', paneId, '-x', String(options.width)]);
    }
}
export function buildTmuxCommand(args) {
    if (process.platform === 'win32') {
        return `wsl tmux ${args.map((a) => JSON.stringify(a)).join(' ')}`;
    }
    return `tmux ${args.map((a) => JSON.stringify(a)).join(' ')}`;
}
// --- Bridge / IPC functions ---
/**
 * Type literal text into a pane WITHOUT pressing Enter.
 * Uses -l (literal) flag so text is not interpreted as key names.
 */
export function typeText(paneId, text) {
    runTmux(['send-keys', '-t', paneId, '-l', '--', text]);
}
/**
 * Send one or more special key names to a pane (Enter, Escape, C-c, Tab, Up, etc.).
 * Does NOT use -l so key names are interpreted by tmux.
 */
export function sendSpecialKey(paneId, ...keys) {
    runTmux(['send-keys', '-t', paneId, ...keys]);
}
/**
 * Type literal text AND submit with Enter.
 * Selects the target pane first so TUI apps (like Codex/ink) have their
 * input handler active before the Enter keystroke arrives — otherwise
 * TUI apps in non-active panes ignore the Enter even if text was typed.
 */
export async function typeTextAndSubmit(paneId, text) {
    const hasPendingInput = (paneSnapshot, inputText) => {
        const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pendingLine = new RegExp(`^\\s*>\\s*${escapeRegex(inputText)}\\s*$`);
        const tailLines = paneSnapshot.split('\n').slice(-12);
        return tailLines.some((line) => pendingLine.test(line.trimEnd()));
    };
    const settleDelayMs = Math.max(80, Math.min(2500, Math.floor(text.length / 40)));
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // Select the pane so its input handler is active, then type + submit.
    runTmux(['select-pane', '-t', paneId]);
    runTmux(['send-keys', '-t', paneId, '-l', '--', text]);
    await sleep(settleDelayMs);
    runTmux(['send-keys', '-t', paneId, 'Enter']);
    await sleep(120);
    // If the input is still visibly pending in the prompt line, retry submit.
    try {
        const snapshot = runTmux(['capture-pane', '-p', '-t', paneId, '-S', '-40']);
        if (hasPendingInput(snapshot, text)) {
            runTmux(['send-keys', '-t', paneId, 'Enter']);
        }
    }
    catch {
        // Best-effort fallback only.
    }
}
/**
 * Capture the last N lines from a pane's scrollback buffer.
 * Uses negative -S value to capture from the end.
 */
export function capturePaneLines(paneId, lineCount) {
    try {
        return runTmux(['capture-pane', '-p', '-t', paneId, '-S', String(-Math.abs(lineCount))]);
    }
    catch {
        return '';
    }
}
/**
 * Get the current pane's ID. Checks $TMUX_PANE env var first,
 * falls back to tmux display-message.
 */
export function getCurrentPaneId() {
    if (process.env.TMUX_PANE) {
        return process.env.TMUX_PANE;
    }
    try {
        return runTmux(['display-message', '-p', '#{pane_id}']).trim();
    }
    catch {
        throw new Error('Not running inside a tmux pane. Cannot determine current pane ID.');
    }
}
/**
 * Get pane dimensions and current working directory.
 */
export function getPaneInfo(paneId) {
    try {
        const output = runTmux([
            'display-message', '-t', paneId, '-p',
            '#{pane_width}|#{pane_height}|#{pane_current_path}',
        ]).trim();
        const parts = output.split('|');
        if (parts.length < 3)
            return null;
        return {
            width: parseInt(parts[0], 10),
            height: parseInt(parts[1], 10),
            cwd: parts[2],
        };
    }
    catch {
        return null;
    }
}
/**
 * Load a tmux config file into the running server.
 */
export function sourceConfig(configPath) {
    try {
        runTmux(['source-file', configPath]);
    }
    catch {
        // Non-fatal: config may have minor errors on some tmux versions
    }
}
//# sourceMappingURL=tmux.js.map