import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  walkFiles,
  hashFile,
  hashAllFiles,
  isBinaryFile,
  snapshotAllFiles,
  generateDiff,
  computeChanges,
} from '../src/lib/snapshot.js';
import { DEFAULT_CONFIG } from '../src/lib/config.js';

async function createTestProject(dir: string): Promise<void> {
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(dir, 'src', 'index.ts'), 'export const x = 1;\n', 'utf-8');
  await writeFile(join(dir, 'src', 'utils.ts'), 'export const y = 2;\n', 'utf-8');
  await writeFile(join(dir, 'README.md'), '# Test\n', 'utf-8');
  await writeFile(join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};\n', 'utf-8');
}

describe('walkFiles', () => {
  it('excludes patterns from the list', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await createTestProject(dir);
    const files = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/utils.ts');
    expect(files).toContain('README.md');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('returns sorted paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await createTestProject(dir);
    const files = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it('respects .gitignore if present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    await createTestProject(dir);
    await writeFile(join(dir, '.gitignore'), 'README.md\n', 'utf-8');
    const files = await walkFiles(dir, DEFAULT_CONFIG.exclude_patterns);
    expect(files).not.toContain('README.md');
  });
});

describe('hashFile', () => {
  it('returns a hex string of length 64', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const filePath = join(dir, 'test.txt');
    await writeFile(filePath, 'hello world', 'utf-8');
    const hash = await hashFile(filePath);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('produces different hashes for different content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const file1 = join(dir, 'a.txt');
    const file2 = join(dir, 'b.txt');
    await writeFile(file1, 'content a', 'utf-8');
    await writeFile(file2, 'content b', 'utf-8');
    const h1 = await hashFile(file1);
    const h2 = await hashFile(file2);
    expect(h1).not.toBe(h2);
  });

  it('produces same hash for same content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const file1 = join(dir, 'a.txt');
    const file2 = join(dir, 'b.txt');
    await writeFile(file1, 'same content', 'utf-8');
    await writeFile(file2, 'same content', 'utf-8');
    const h1 = await hashFile(file1);
    const h2 = await hashFile(file2);
    expect(h1).toBe(h2);
  });
});

describe('isBinaryFile', () => {
  it('returns false for text files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const filePath = join(dir, 'text.ts');
    await writeFile(filePath, 'const x = 1;\n', 'utf-8');
    expect(await isBinaryFile(filePath)).toBe(false);
  });

  it('returns true for files with null bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const filePath = join(dir, 'binary.bin');
    await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x47]));
    expect(await isBinaryFile(filePath)).toBe(true);
  });
});

describe('generateDiff', () => {
  it('produces a unified diff string', () => {
    const diff = generateDiff('line1\nline2\n', 'line1\nline2 changed\n', 'test.ts', 3);
    expect(diff).toContain('--- a/test.ts');
    expect(diff).toContain('+++ b/test.ts');
    expect(diff).toContain('-line2');
    expect(diff).toContain('+line2 changed');
  });

  it('returns empty-ish diff for identical content', () => {
    const diff = generateDiff('same\n', 'same\n', 'test.ts', 3);
    expect(diff).not.toContain('@@');
  });
});

describe('computeChanges', () => {
  it('detects added, modified, and deleted files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
    const snapshotDir = join(dir, '.handoff', 'snapshots');
    await mkdir(snapshotDir, { recursive: true });

    // Set up initial state
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'keep.ts'), 'original\n', 'utf-8');
    await writeFile(join(dir, 'src', 'modify.ts'), 'original\n', 'utf-8');
    await writeFile(join(dir, 'src', 'delete.ts'), 'will be deleted\n', 'utf-8');

    const files = ['src/keep.ts', 'src/modify.ts', 'src/delete.ts'];
    const oldHashes = await hashAllFiles(dir, files);
    await snapshotAllFiles(dir, files, snapshotDir, 10);

    // Simulate changes
    await writeFile(join(dir, 'src', 'modify.ts'), 'changed\n', 'utf-8');
    await writeFile(join(dir, 'src', 'added.ts'), 'new file\n', 'utf-8');
    const currentFiles = ['src/keep.ts', 'src/modify.ts', 'src/added.ts'];
    const newHashes = await hashAllFiles(dir, currentFiles);

    const changes = await computeChanges(dir, snapshotDir, oldHashes, newHashes, DEFAULT_CONFIG);

    expect(changes.some((c) => c.path === 'src/modify.ts' && c.type === 'modified')).toBe(true);
    expect(changes.some((c) => c.path === 'src/added.ts' && c.type === 'added')).toBe(true);
    expect(changes.some((c) => c.path === 'src/delete.ts' && c.type === 'deleted')).toBe(true);
    expect(changes.some((c) => c.path === 'src/keep.ts')).toBe(false);
  });
});
