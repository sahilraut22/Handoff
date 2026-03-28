import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { walkFiles, hashAllFiles, snapshotAllFiles, computeChanges } from '../../src/lib/snapshot.js';
import { generateHandoffMarkdown } from '../../src/lib/markdown.js';
import { DEFAULT_CONFIG } from '../../src/lib/config.js';
import type { Session, HandoffContext } from '../../src/types/index.js';

async function setupProject(dir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    await mkdir(join(dir, path.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }
}

async function initSession(dir: string): Promise<Session> {
  const handoffDir = join(dir, '.handoff');
  const snapshotDir = join(handoffDir, 'snapshots');
  await mkdir(snapshotDir, { recursive: true });

  const files = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
  const fileHashes = await hashAllFiles(dir, files);
  await snapshotAllFiles(dir, files, snapshotDir, 10);

  const session: Session = {
    session_id: 'export-test-id',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    working_dir: dir,
    file_hashes: fileHashes,
    excluded_patterns: DEFAULT_CONFIG.exclude_patterns,
  };
  await writeFile(join(handoffDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

describe('export logic', () => {
  it('detects no changes when nothing changed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await setupProject(dir, { 'src/index.ts': 'const x = 1;\n' });
    const session = await initSession(dir);

    const currentFiles = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    const currentHashes = await hashAllFiles(dir, currentFiles);
    const changes = await computeChanges(
      dir,
      join(dir, '.handoff', 'snapshots'),
      session.file_hashes,
      currentHashes,
      DEFAULT_CONFIG
    );

    expect(changes).toHaveLength(0);
  });

  it('detects modified file and includes diff', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await setupProject(dir, { 'src/index.ts': 'const x = 1;\n' });
    const session = await initSession(dir);

    // Modify file
    await writeFile(join(dir, 'src', 'index.ts'), 'const x = 2;\n', 'utf-8');

    const currentFiles = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    const currentHashes = await hashAllFiles(dir, currentFiles);
    const changes = await computeChanges(
      dir,
      join(dir, '.handoff', 'snapshots'),
      session.file_hashes,
      currentHashes,
      DEFAULT_CONFIG
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('modified');
    expect(changes[0].path).toBe('src/index.ts');
    expect(changes[0].diff).toContain('-const x = 1;');
    expect(changes[0].diff).toContain('+const x = 2;');
  });

  it('generates valid HANDOFF.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await setupProject(dir, {
      'src/index.ts': 'const x = 1;\n',
      'src/utils.ts': 'export const y = 2;\n',
    });
    const session = await initSession(dir);

    await writeFile(join(dir, 'src', 'index.ts'), 'const x = 999;\n', 'utf-8');
    await writeFile(join(dir, 'src', 'new.ts'), 'export const z = 3;\n', 'utf-8');

    const currentFiles = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    const currentHashes = await hashAllFiles(dir, currentFiles);
    const changes = await computeChanges(
      dir,
      join(dir, '.handoff', 'snapshots'),
      session.file_hashes,
      currentHashes,
      DEFAULT_CONFIG
    );

    const context: HandoffContext = {
      session,
      changes,
      message: 'Test handoff',
      include_memory: false,
      config: DEFAULT_CONFIG,
    };

    const md = generateHandoffMarkdown(context);
    await writeFile(join(dir, 'HANDOFF.md'), md, 'utf-8');

    const written = await readFile(join(dir, 'HANDOFF.md'), 'utf-8');
    expect(written).toContain('# Handoff Context');
    expect(written).toContain('Test handoff');
    expect(written).toContain('src/index.ts');
    expect(written).toContain('src/new.ts');
  });
});
