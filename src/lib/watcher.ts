import { watch as chokidarWatch } from 'chokidar';
import { writeFile, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { logger } from './logger.js';
import type { WatcherConfig, WatcherState } from '../types/index.js';

export type { WatcherConfig, WatcherState };

export interface WatcherEvents {
  onFileChange: (path: string, type: 'add' | 'change' | 'unlink') => void;
  onRegenerate: (changedPaths: string[]) => void;
  onError: (error: Error) => void;
}

export interface WatcherHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getState: () => WatcherState;
}

const WATCHER_STATE_FILE = '.handoff/watcher.json';

export function createWatcher(config: WatcherConfig, events: WatcherEvents): WatcherHandle {
  let watcher: ReturnType<typeof chokidarWatch> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRegenTime = 0;
  const pendingChanges = new Set<string>();
  const startTime = new Date().toISOString();

  const state: WatcherState = {
    pid: process.pid,
    started_at: startTime,
    last_scan: startTime,
    changes_since_regen: 0,
    total_regenerations: 0,
    watched_files: 0,
  };

  async function saveState(): Promise<void> {
    try {
      const statePath = join(config.working_dir, WATCHER_STATE_FILE);
      await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // Non-fatal: state persistence failure
    }
  }

  function scheduleRegen(changedPath: string): void {
    pendingChanges.add(changedPath);
    state.changes_since_regen++;
    state.last_scan = new Date().toISOString();

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      triggerRegenIfNeeded();
    }, config.debounce_ms);
  }

  function triggerRegenIfNeeded(): void {
    if (!config.auto_regenerate) return;

    const now = Date.now();
    if (state.changes_since_regen < config.change_threshold) return;
    if (now - lastRegenTime < config.max_regen_interval_ms) return;

    const changed = [...pendingChanges];
    pendingChanges.clear();
    state.changes_since_regen = 0;
    lastRegenTime = now;
    state.total_regenerations++;

    logger.info('Auto-regenerating HANDOFF.md', { changed_files: changed.length });
    events.onRegenerate(changed);
    void saveState();
  }

  async function start(): Promise<void> {
    // Build ignored array: chokidar uses anymatch patterns
    const ignored: (string | RegExp)[] = [
      /(^|[/\\])\../,              // dotfiles
      /node_modules/,
      /\.handoff/,
      /dist\//,
      /build\//,
    ];

    // Add config-specified patterns as string globs
    for (const pattern of config.exclude_patterns) {
      if (pattern && !['node_modules', '.git', 'dist', 'build', '.handoff'].includes(pattern)) {
        ignored.push(new RegExp(pattern.replace(/\*/g, '.*')));
      }
    }

    watcher = chokidarWatch(config.working_dir, {
      ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    watcher.on('add', (filePath: string) => {
      const rel = relative(config.working_dir, filePath);
      logger.debug('File added', { path: rel });
      events.onFileChange(rel, 'add');
      scheduleRegen(rel);
    });

    watcher.on('change', (filePath: string) => {
      const rel = relative(config.working_dir, filePath);
      logger.debug('File changed', { path: rel });
      events.onFileChange(rel, 'change');
      scheduleRegen(rel);
    });

    watcher.on('unlink', (filePath: string) => {
      const rel = relative(config.working_dir, filePath);
      logger.debug('File removed', { path: rel });
      events.onFileChange(rel, 'unlink');
      scheduleRegen(rel);
    });

    watcher.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Watcher error', { error: error.message });
      events.onError(error);
    });

    watcher.on('ready', () => {
      const watched = watcher?.getWatched() ?? {};
      state.watched_files = Object.values(watched).reduce((sum, files) => sum + (files as string[]).length, 0);
      logger.info('Watcher ready', { watched_files: state.watched_files, dir: config.working_dir });
      void saveState();
    });
  }

  async function stop(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    logger.debug('Watcher stopped');
  }

  function getState(): WatcherState {
    return { ...state };
  }

  return { start, stop, getState };
}

export async function loadWatcherState(workingDir: string): Promise<WatcherState | null> {
  try {
    const content = await readFile(join(workingDir, WATCHER_STATE_FILE), 'utf-8');
    return JSON.parse(content) as WatcherState;
  } catch {
    return null;
  }
}
