import { execSync, execFileSync } from 'node:child_process';
import type { TmuxPane } from '../types/index.js';

function buildTmuxCommand(args: string[]): string {
  if (process.platform === 'win32') {
    return `wsl tmux ${args.map((a) => JSON.stringify(a)).join(' ')}`;
  }
  return `tmux ${args.map((a) => JSON.stringify(a)).join(' ')}`;
}

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

export function listPanes(): TmuxPane[] {
  const format = '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_current_command}|#{window_name}|#{session_name}|#{pane_active}';
  const output = runTmux(['list-panes', '-a', '-F', format]);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(parsePane)
    .filter((p): p is TmuxPane => p !== null);
}

export function findPane(identifier: string): TmuxPane | undefined {
  const panes = listPanes();
  // Match by pane_id, pane_title, or window name
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
  // Send the text as a literal string using send-keys with Enter
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
        // Stable for 2 consecutive polls means response is complete
        if (stableCount >= 2) {
          clearInterval(interval);
          resolve(current.slice(baseline.length).trim());
        }
      }
    }, pollIntervalMs);
  });
}

export { buildTmuxCommand };
