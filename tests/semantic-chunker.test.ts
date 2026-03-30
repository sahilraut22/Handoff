import { describe, it, expect } from 'vitest';
import { chunkCode, chunkDiff, selectChunks, assembleChunks } from '../src/lib/semantic-chunker.js';

const SAMPLE_TS = `import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class UserService {
  private users: string[] = [];

  addUser(name: string): void {
    this.users.push(name);
  }

  getUsers(): string[] {
    return this.users;
  }
}

export type UserId = string;
`;

const SAMPLE_DIFF = `@@ -1,5 +1,5 @@
 import { readFile } from 'node:fs/promises';
-const OLD = 'old';
+const NEW = 'new';
 export function greet(name: string): string {
-  return \`Hi, \${name}\`;
+  return \`Hello, \${name}!\`;
 }
@@ -10,3 +10,4 @@
 export class UserService {
+  private cache = new Map();
   private users: string[] = [];
 }`;

describe('chunkCode', () => {
  it('returns at least one chunk for non-empty code', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('identifies import block', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const importChunk = chunks.find((c) => c.type === 'import');
    expect(importChunk).toBeDefined();
  });

  it('identifies function chunks', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const funcChunk = chunks.find((c) => c.type === 'function' && c.name === 'greet');
    expect(funcChunk).toBeDefined();
  });

  it('identifies class chunks', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const classChunk = chunks.find((c) => c.type === 'class' && c.name === 'UserService');
    expect(classChunk).toBeDefined();
  });

  it('assigns token counts', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    for (const chunk of chunks) {
      expect(chunk.token_count).toBeGreaterThan(0);
    }
  });

  it('assigns valid start/end lines', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    for (const chunk of chunks) {
      expect(chunk.start_line).toBeGreaterThanOrEqual(0);
      expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);
    }
  });

  it('handles empty code gracefully', () => {
    const chunks = chunkCode('', 'typescript');
    expect(Array.isArray(chunks)).toBe(true);
  });
});

describe('chunkDiff', () => {
  it('returns at least one chunk for non-empty diff', () => {
    const chunks = chunkDiff(SAMPLE_DIFF, 'test.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty diff', () => {
    const chunks = chunkDiff('', 'test.ts');
    expect(chunks).toEqual([]);
  });

  it('each chunk has positive token count', () => {
    const chunks = chunkDiff(SAMPLE_DIFF, 'test.ts');
    for (const chunk of chunks) {
      expect(chunk.token_count).toBeGreaterThan(0);
    }
  });

  it('chunks from different hunks are separate', () => {
    const chunks = chunkDiff(SAMPLE_DIFF, 'test.ts');
    // SAMPLE_DIFF has 2 @@ hunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('selectChunks', () => {
  it('returns empty for no chunks', () => {
    expect(selectChunks([], 1000)).toEqual([]);
  });

  it('respects token budget', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const budget = 50; // tight budget
    const selected = selectChunks(chunks, budget);
    const totalTokens = selected.reduce((sum, c) => sum + c.token_count, 0);
    expect(totalTokens).toBeLessThanOrEqual(budget + 20); // allow small overage from compression
  });

  it('always includes import chunks', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const importChunk = chunks.find((c) => c.type === 'import');
    if (importChunk) {
      const selected = selectChunks(chunks, 1000);
      expect(selected.some((c) => c.type === 'import')).toBe(true);
    }
  });

  it('returns chunks sorted by line number', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const selected = selectChunks(chunks, 1000);
    for (let i = 1; i < selected.length; i++) {
      expect(selected[i]!.start_line).toBeGreaterThanOrEqual(selected[i - 1]!.start_line);
    }
  });
});

describe('assembleChunks', () => {
  it('returns empty string for no chunks', () => {
    expect(assembleChunks([], 100)).toBe('');
  });

  it('joins chunks with content', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    const selected = selectChunks(chunks, 2000);
    const assembled = assembleChunks(selected, SAMPLE_TS.split('\n').length);
    expect(assembled.length).toBeGreaterThan(0);
  });

  it('inserts omission markers for gaps', () => {
    const chunks = chunkCode(SAMPLE_TS, 'typescript');
    // Select only a few chunks (with gaps between)
    const first = chunks[0];
    const last = chunks[chunks.length - 1];
    if (first && last && last.start_line - first.end_line > 5) {
      const assembled = assembleChunks([first, last], SAMPLE_TS.split('\n').length);
      expect(assembled).toContain('omitted');
    }
  });
});
