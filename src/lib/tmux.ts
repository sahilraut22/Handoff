import { execSync, execFileSync } from 'node:child_process';
import type { TmuxPane } from '../types/index.js';

function runTmux(args: string[]): string {
  try {
    if (process.platform === 'win32') {
      return execSync(`wsl tmux ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
    return execFileSync('tmux', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error('tmux is not installed or not found in PATH.');
    }
    throw new Error(`tmux command failed: ${(err as Error).message}`);
  }
}

function runTmuxInteractive(args: string[]): void {
  try {
    if (process.platform === 'win32') {
      execSync(`wsl tmux ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
        stdio: 'inherit',
      });
    } else {
      execFileSync('tmux', args, { stdio: 'inherit' });
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error('tmux is not installed or not found in PATH.');
    }
    // Interactive commands may exit with non-zero on normal detach, ignore those
  }
}

export function isTmuxAvailable(): boolean {
  try {
    runTmux(['info']);
    return true;
  } catch {
    return false;
  }
}

function parsePane(line: string): TmuxPane | null {
  const parts = line.split('|');
  if (parts.length < 7) return null;
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

export function listPanes(): TmuxPane[] {
  const output = runTmux(['list-panes', '-a', '-F', PANE_FORMAT]);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(parsePane)
    .filter((p): p is TmuxPane => p !== null);
}

export function findPane(identifier: string): TmuxPane | undefined {
  const panes = listPanes();
  return panes.find(
    (p) =>
      p.pane_id === identifier ||
      p.pane_title === identifier ||
      p.window_name === identifier
  );
}

export function setPaneTitle(title: string, paneId?: string): void {
  const args = ['select-pane', '-T', title];
  if (paneId) {
    args.push('-t', paneId);
  }
  runTmux(args);
}

export function sendKeys(paneId: string, text: string): void {
  runTmux(['send-keys', '-t', paneId, text, 'Enter']);
}

export function capturePane(paneId: string): string {
  try {
    return runTmux(['capture-pane', '-p', '-t', paneId]);
  } catch {
    return '';
  }
}

export async function waitForResponse(
  paneId: string,
  timeoutMs: number,
  pollIntervalMs = 500
): Promise<string> {
  const baseline = capturePane(paneId);
  const start = Date.now();
  let prevContent = baseline;
  let stableCount = 0;

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const current = capturePane(paneId);

      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(current.slice(baseline.length).trim());
        return;
      }

      if (current !== prevContent) {
        stableCount = 0;
        prevContent = current;
      } else if (current !== baseline) {
        stableCount++;
        if (stableCount >= 2) {
          clearInterval(interval);
          resolve(current.slice(baseline.length).trim());
        }
      }
    }, pollIntervalMs);
  });
}

// --- New workspace management functions ---

export function hasSession(name: string): boolean {
  try {
    runTmux(['has-session', '-t', name]);
    return true;
  } catch {
    return false;
  }
}

export function newSession(name: string, options?: { detached?: boolean; startDir?: string }): string {
  const args = ['new-session', '-s', name, '-P', '-F', '#{pane_id}'];
  if (options?.detached !== false) {
    args.push('-d');
  }
  if (options?.startDir) {
    args.push('-c', options.startDir);
  }
  return runTmux(args).trim();
}

export function splitPane(targetPane: string, options?: { horizontal?: boolean; startDir?: string }): string {
  const args = ['split-window', '-t', targetPane, '-P', '-F', '#{pane_id}'];
  if (options?.horizontal) {
    args.push('-h');
  }
  if (options?.startDir) {
    args.push('-c', options.startDir);
  }
  return runTmux(args).trim();
}

export function killPane(paneId: string): void {
  runTmux(['kill-pane', '-t', paneId]);
}

export function killSession(name: string): void {
  runTmux(['kill-session', '-t', name]);
}

export function selectPane(paneId: string): void {
  runTmux(['select-pane', '-t', paneId]);
}

export function selectLayout(layout: string, targetWindow?: string): void {
  const args = ['select-layout'];
  if (targetWindow) {
    args.push('-t', targetWindow);
  }
  args.push(layout);
  runTmux(args);
}

export function attachSession(name: string): void {
  if (process.env.TMUX) {
    // Already inside tmux - switch client instead of attach
    runTmux(['switch-client', '-t', name]);
  } else {
    runTmuxInteractive(['attach-session', '-t', name]);
  }
}

export function getSessionPanes(sessionName: string): TmuxPane[] {
  try {
    const output = runTmux(['list-panes', '-s', '-t', sessionName, '-F', PANE_FORMAT]);
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(parsePane)
      .filter((p): p is TmuxPane => p !== null);
  } catch {
    return [];
  }
}

export function resizePane(paneId: string, options: { height?: number; width?: number }): void {
  if (options.height !== undefined) {
    runTmux(['resize-pane', '-t', paneId, '-y', String(options.height)]);
  }
  if (options.width !== undefined) {
    runTmux(['resize-pane', '-t', paneId, '-x', String(options.width)]);
  }
}

export function buildTmuxCommand(args: string[]): string {
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
export function typeText(paneId: string, text: string): void {
  runTmux(['send-keys', '-t', paneId, '-l', '--', text]);
}

/**
 * Send one or more special key names to a pane (Enter, Escape, C-c, Tab, Up, etc.).
 * Does NOT use -l so key names are interpreted by tmux.
 */
export function sendSpecialKey(paneId: string, ...keys: string[]): void {
  runTmux(['send-keys', '-t', paneId, ...keys]);
}

/**
 * Capture the last N lines from a pane's scrollback buffer.
 * Uses negative -S value to capture from the end.
 */
export function capturePaneLines(paneId: string, lineCount: number): string {
  try {
    return runTmux(['capture-pane', '-p', '-t', paneId, '-S', String(-Math.abs(lineCount))]);
  } catch {
    return '';
  }
}

/**
 * Get the current pane's ID. Checks $TMUX_PANE env var first,
 * falls back to tmux display-message.
 */
export function getCurrentPaneId(): string {
  if (process.env.TMUX_PANE) {
    return process.env.TMUX_PANE;
  }
  try {
    return runTmux(['display-message', '-p', '#{pane_id}']).trim();
  } catch {
    throw new Error('Not running inside a tmux pane. Cannot determine current pane ID.');
  }
}

/**
 * Get pane dimensions and current working directory.
 */
export function getPaneInfo(paneId: string): { width: number; height: number; cwd: string } | null {
  try {
    const output = runTmux([
      'display-message', '-t', paneId, '-p',
      '#{pane_width}|#{pane_height}|#{pane_current_path}',
    ]).trim();
    const parts = output.split('|');
    if (parts.length < 3) return null;
    return {
      width: parseInt(parts[0], 10),
      height: parseInt(parts[1], 10),
      cwd: parts[2],
    };
  } catch {
    return null;
  }
}

/**
 * Load a tmux config file into the running server.
 */
export function sourceConfig(configPath: string): void {
  try {
    runTmux(['source-file', configPath]);
  } catch {
    // Non-fatal: config may have minor errors on some tmux versions
  }
}
