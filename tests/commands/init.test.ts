import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { walkFiles, hashAllFiles, snapshotAllFiles } from '../../src/lib/snapshot.js';
import { DEFAULT_CONFIG } from '../../src/lib/config.js';
import type { Session } from '../../src/types/index.js';

// These tests exercise the core logic that init.ts uses,
// without spawning a child process.

async function simulateInit(workingDir: string): Promise<Session> {
  const handoffDir = join(workingDir, '.handoff');
  const snapshotDir = join(handoffDir, 'snapshots');
  await mkdir(snapshotDir, { recursive: true });

  const files = await walkFiles(workingDir, DEFAULT_CONFIG.exclude_patterns);
  const fileHashes = await hashAllFiles(workingDir, files);
  await snapshotAllFiles(workingDir, files, snapshotDir, 10);

  const session: Session = {
    session_id: 'test-id',
    created_at: new Date().toISOString(),
    working_dir: workingDir,
    file_hashes: fileHashes,
    excluded_patterns: DEFAULT_CONFIG.exclude_patterns,
  };

  await writeFile(join(handoffDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

describe('init logic', () => {
  it('creates session.json with correct structure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'src', 'index.ts'), 'const x = 1;', 'utf-8');

    const session = await simulateInit(dir);

    expect(session.session_id).toBeDefined();
    expect(session.created_at).toBeDefined();
    expect(session.working_dir).toBe(dir);
    expect(typeof session.file_hashes).toBe('object');
    expect(Array.isArray(session.excluded_patterns)).toBe(true);

    const written = await readFile(join(dir, '.handoff', 'session.json'), 'utf-8');
    const parsed = JSON.parse(written) as Session;
    expect(parsed.session_id).toBe(session.session_id);
    expect(parsed.file_hashes['src/index.ts']).toBeDefined();
  });

  it('tracks files in subdirectories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await mkdir(join(dir, 'src', 'lib'), { recursive: true });
    await writeFile(join(dir, 'src', 'lib', 'util.ts'), 'export const u = 1;', 'utf-8');

    const session = await simulateInit(dir);
    expect(session.file_hashes['src/lib/util.ts']).toBeDefined();
  });

  it('excludes node_modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports={}', 'utf-8');
    await writeFile(join(dir, 'index.ts'), 'const x = 1;', 'utf-8');

    const session = await simulateInit(dir);
    const trackedPaths = Object.keys(session.file_hashes);
    expect(trackedPaths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(trackedPaths).toContain('index.ts');
  });

  it('creates snapshots for text files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await writeFile(join(dir, 'hello.ts'), 'export const hello = "world";', 'utf-8');

    await simulateInit(dir);

    const snapshotContent = await readFile(
      join(dir, '.handoff', 'snapshots', 'hello.ts'),
      'utf-8'
    );
    expect(snapshotContent).toBe('export const hello = "world";');
  });
});
