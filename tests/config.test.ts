import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, DEFAULT_CONFIG } from '../src/lib/config.js';

describe('config', () => {
  it('returns defaults when no config files exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const config = await loadConfig(dir);
    expect(config.max_diff_lines).toBe(DEFAULT_CONFIG.max_diff_lines);
    expect(config.exclude_patterns).toEqual(expect.arrayContaining(['node_modules', '.git']));
  });

  it('merges project config over defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await mkdir(join(dir, '.handoff'), { recursive: true });
    await writeFile(
      join(dir, '.handoff', 'config.json'),
      JSON.stringify({ max_diff_lines: 100 }),
      'utf-8'
    );
    const config = await loadConfig(dir);
    expect(config.max_diff_lines).toBe(100);
    // Defaults still present
    expect(config.exclude_patterns).toEqual(expect.arrayContaining(['node_modules']));
  });

  it('appends project exclude patterns to defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await mkdir(join(dir, '.handoff'), { recursive: true });
    await writeFile(
      join(dir, '.handoff', 'config.json'),
      JSON.stringify({ exclude_patterns: ['custom-dir'] }),
      'utf-8'
    );
    const config = await loadConfig(dir);
    expect(config.exclude_patterns).toContain('custom-dir');
    expect(config.exclude_patterns).toContain('node_modules');
  });
});
