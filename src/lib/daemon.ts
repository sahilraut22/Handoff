import { fork } from 'node:child_process';
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { loadWatcherState } from './watcher.js';
import type { WatcherState } from '../types/index.js';

export interface DaemonStartConfig {
  working_dir: string;
  pid_file?: string;
  log_file?: string;
  detach?: boolean;
  debounce_ms?: number;
  change_threshold?: number;
  max_regen_interval_ms?: number;
}

const DEFAULT_PID_FILE = '.handoff/daemon.pid';

export async function startDaemon(config: DaemonStartConfig): Promise<number> {
  const pidFile = join(config.working_dir, config.pid_file ?? DEFAULT_PID_FILE);
  const logFile = join(config.working_dir, config.log_file ?? '.handoff/daemon.log');
  const detach = config.detach ?? true;

  // Resolve the daemon entry point
  const __filename = fileURLToPath(import.meta.url);
  const daemonEntry = join(__filename, '..', '..', 'daemon-entry.js');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HANDOFF_DAEMON_WORKING_DIR: config.working_dir,
    HANDOFF_DAEMON_PID_FILE: pidFile,
    HANDOFF_DAEMON_LOG_FILE: logFile,
    HANDOFF_DAEMON_DEBOUNCE_MS: String(config.debounce_ms ?? 2000),
    HANDOFF_DAEMON_CHANGE_THRESHOLD: String(config.change_threshold ?? 3),
    HANDOFF_DAEMON_MAX_REGEN_MS: String(config.max_regen_interval_ms ?? 60000),
  };

  const child = fork(daemonEntry, [], {
    detached: detach,
    stdio: detach ? 'ignore' : 'inherit',
    env,
  });

  if (detach) {
    child.unref();
  }

  // Wait briefly for PID file to be written
  const pid = child.pid ?? 0;
  if (pid) {
    logger.debug('Daemon process spawned', { pid, working_dir: config.working_dir });
  }

  return pid;
}

export async function stopDaemon(workingDir: string, pidFile?: string): Promise<void> {
  const pidPath = join(workingDir, pidFile ?? DEFAULT_PID_FILE);
  let pid: number;

  try {
    const content = await readFile(pidPath, 'utf-8');
    pid = parseInt(content.trim(), 10);
  } catch {
    throw new Error('No daemon PID file found. Is the daemon running?');
  }

  if (isNaN(pid) || pid <= 0) {
    throw new Error('Invalid PID in daemon PID file.');
  }

  try {
    process.kill(pid, 'SIGTERM');
    logger.debug('Sent SIGTERM to daemon', { pid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ESRCH')) {
      // Process not found -- clean up stale PID file
      await unlink(pidPath).catch(() => undefined);
      throw new Error(`Daemon process (PID ${pid}) is not running. Cleaned up stale PID file.`);
    }
    throw err;
  }

  // Give process time to clean up
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
}

export async function isDaemonRunning(workingDir: string, pidFile?: string): Promise<boolean> {
  const pidPath = join(workingDir, pidFile ?? DEFAULT_PID_FILE);

  try {
    const content = await readFile(pidPath, 'utf-8');
    const pid = parseInt(content.trim(), 10);
    if (isNaN(pid) || pid <= 0) return false;

    // Send signal 0 to test liveness (throws if process not found)
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ESRCH')) return false;
    if (message.includes('ENOENT')) return false;
    // EPERM means process exists but we can't signal it -- still alive
    if (message.includes('EPERM')) return true;
    return false;
  }
}

export async function getDaemonStatus(workingDir: string): Promise<WatcherState | null> {
  const running = await isDaemonRunning(workingDir);
  if (!running) return null;
  return loadWatcherState(workingDir);
}

/**
 * Write the PID file for the current process (called from within the daemon entry).
 */
export async function writePidFile(pidPath: string): Promise<void> {
  await writeFile(pidPath, String(process.pid), 'utf-8');
}

/**
 * Remove PID file (called on daemon shutdown).
 */
export async function removePidFile(pidPath: string): Promise<void> {
  await unlink(pidPath).catch(() => undefined);
}

/**
 * Check if the daemon entry point file exists.
 */
export async function daemonEntryExists(entryPath: string): Promise<boolean> {
  try {
    await access(entryPath);
    return true;
  } catch {
    return false;
  }
}
