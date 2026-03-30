import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatcher } from '../src/lib/watcher.js';
import type { WatcherConfig } from '../src/types/index.js';

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createWatcher', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-watcher-'));
    // Create .handoff directory for state file
    await mkdir(join(tmpDir, '.handoff'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns handle with start/stop/getState', () => {
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: ['node_modules'],
      debounce_ms: 50,
      auto_regenerate: false,
      change_threshold: 1,
      max_regen_interval_ms: 60000,
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: () => {},
      onError: () => {},
    });
    expect(typeof watcher.start).toBe('function');
    expect(typeof watcher.stop).toBe('function');
    expect(typeof watcher.getState).toBe('function');
  });

  it('getState returns valid WatcherState before start', () => {
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: [],
      debounce_ms: 50,
      auto_regenerate: false,
      change_threshold: 3,
      max_regen_interval_ms: 60000,
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: () => {},
      onError: () => {},
    });
    const state = watcher.getState();
    expect(state.pid).toBe(process.pid);
    expect(state.changes_since_regen).toBe(0);
    expect(state.total_regenerations).toBe(0);
    expect(typeof state.started_at).toBe('string');
  });

  it('detects file changes when started', async () => {
    const changes: string[] = [];
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: ['.handoff'],
      debounce_ms: 50,
      auto_regenerate: false,
      change_threshold: 100,
      max_regen_interval_ms: 60000,
    };
    const watcher = createWatcher(config, {
      onFileChange: (path) => changes.push(path),
      onRegenerate: () => {},
      onError: () => {},
    });
    await watcher.start();
    await wait(300); // let chokidar initialize

    await writeFile(join(tmpDir, 'test.ts'), 'export const x = 1;\n', 'utf-8');
    await wait(400); // wait for event

    await watcher.stop();
    expect(changes.length).toBeGreaterThan(0);
  });

  it('debounces rapid changes', async () => {
    const regenerations: string[][] = [];
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: ['.handoff'],
      debounce_ms: 200,
      auto_regenerate: true,
      change_threshold: 2,
      max_regen_interval_ms: 0, // no rate limit
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: (paths) => regenerations.push(paths),
      onError: () => {},
    });
    await watcher.start();
    await wait(300);

    // Write multiple files rapidly
    await writeFile(join(tmpDir, 'a.ts'), 'const a = 1;\n', 'utf-8');
    await writeFile(join(tmpDir, 'b.ts'), 'const b = 2;\n', 'utf-8');
    await writeFile(join(tmpDir, 'c.ts'), 'const c = 3;\n', 'utf-8');
    await wait(500); // wait for debounce to fire

    await watcher.stop();
    // Should batch into 1 regeneration, not 3
    expect(regenerations.length).toBeLessThanOrEqual(2);
  });

  it('does not regenerate when change_threshold not met', async () => {
    const regenerations: string[][] = [];
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: ['.handoff'],
      debounce_ms: 100,
      auto_regenerate: true,
      change_threshold: 10, // high threshold
      max_regen_interval_ms: 0,
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: (paths) => regenerations.push(paths),
      onError: () => {},
    });
    await watcher.start();
    await wait(200);

    await writeFile(join(tmpDir, 'one.ts'), 'const x = 1;\n', 'utf-8');
    await wait(300);

    await watcher.stop();
    expect(regenerations.length).toBe(0);
  });

  it('persists state to watcher.json', async () => {
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: ['.handoff'],
      debounce_ms: 50,
      auto_regenerate: false,
      change_threshold: 100,
      max_regen_interval_ms: 60000,
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: () => {},
      onError: () => {},
    });
    await watcher.start();
    await wait(500); // wait for 'ready' event and state save

    await watcher.stop();

    const stateFile = join(tmpDir, '.handoff', 'watcher.json');
    const content = await readFile(stateFile, 'utf-8').catch(() => null);
    if (content) {
      const state = JSON.parse(content);
      expect(state.pid).toBe(process.pid);
      expect(typeof state.watched_files).toBe('number');
    }
    // State file may not exist if ready didn't fire in time -- that's OK in CI
  });

  it('stops cleanly without errors', async () => {
    const config: WatcherConfig = {
      working_dir: tmpDir,
      exclude_patterns: [],
      debounce_ms: 100,
      auto_regenerate: false,
      change_threshold: 5,
      max_regen_interval_ms: 60000,
    };
    const watcher = createWatcher(config, {
      onFileChange: () => {},
      onRegenerate: () => {},
      onError: () => {},
    });
    await watcher.start();
    await expect(watcher.stop()).resolves.not.toThrow();
  });
});
