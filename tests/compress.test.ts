import { describe, it, expect } from 'vitest';
import { classifyPriority, compressDiff, compressChanges } from '../src/lib/compress.js';
import { estimateTokens } from '../src/lib/tokens.js';
import type { FileChange } from '../src/types/index.js';

function makeChange(path: string, overrides: Partial<FileChange> = {}): FileChange {
  return {
    path,
    type: 'modified',
    diff: `--- a/${path}\n+++ b/${path}\n@@ -1,3 +1,3 @@\n line1\n-old\n+new\n line3`,
    linesAdded: 1,
    linesRemoved: 1,
    ...overrides,
  };
}

describe('classifyPriority', () => {
  it('classifies security files as critical', () => {
    expect(classifyPriority(makeChange('src/auth.ts'))).toBe('critical');
    expect(classifyPriority(makeChange('.env.production'))).toBe('critical');
    expect(classifyPriority(makeChange('src/crypto/hash.ts'))).toBe('critical');
  });

  it('classifies package.json as critical', () => {
    expect(classifyPriority(makeChange('package.json'))).toBe('critical');
    expect(classifyPriority(makeChange('tsconfig.json'))).toBe('critical');
  });

  it('classifies CI/CD as critical', () => {
    expect(classifyPriority(makeChange('.github/workflows/ci.yml'))).toBe('critical');
  });

  it('classifies core source files as high', () => {
    expect(classifyPriority(makeChange('src/lib/snapshot.ts'))).toBe('high');
    expect(classifyPriority(makeChange('src/api/routes.ts'))).toBe('high');
    expect(classifyPriority(makeChange('src/index.ts'))).toBe('high');
  });

  it('classifies test files as high', () => {
    expect(classifyPriority(makeChange('tests/foo.test.ts'))).toBe('high');
    expect(classifyPriority(makeChange('src/bar.spec.js'))).toBe('high');
  });

  it('classifies docs as low', () => {
    expect(classifyPriority(makeChange('README.md'))).toBe('low');
    expect(classifyPriority(makeChange('CHANGELOG.md'))).toBe('low');
  });

  it('classifies dist files as low', () => {
    expect(classifyPriority(makeChange('dist/index.js'))).toBe('low');
  });

  it('classifies generic src as medium', () => {
    expect(classifyPriority(makeChange('src/components/Button.tsx'))).toBe('medium');
    expect(classifyPriority(makeChange('src/utils/format.ts'))).toBe('medium');
  });
});

describe('estimateTokens', () => {
  it('estimates tokens as chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('x'.repeat(100))).toBe(25);
  });

  it('rounds up', () => {
    expect(estimateTokens('abc')).toBe(1); // 3 chars / 4 = 0.75, ceil = 1
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('compressDiff', () => {
  const largeDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,20 +1,20 @@
 line1
 line2
 line3
 line4
 line5
 line6
 line7
 line8
 line9
 line10
-old11
+new11
 line12
 line13
 line14
 line15
 line16
 line17
 line18
 line19
 line20`;

  it('returns original when under target', () => {
    const result = compressDiff('short diff', 100);
    expect(result).toBe('short diff');
  });

  it('compresses large diff', () => {
    const result = compressDiff(largeDiff, 10);
    expect(result.length).toBeLessThan(largeDiff.length);
    expect(result).toContain('omitted');
  });

  it('preserves hunk headers', () => {
    const result = compressDiff(largeDiff, 8);
    expect(result).toContain('@@');
  });

  it('preserves +/- lines near changes', () => {
    const result = compressDiff(largeDiff, 8);
    expect(result).toContain('+new11');
    expect(result).toContain('-old11');
  });
});

describe('compressChanges', () => {
  const changes: FileChange[] = [
    makeChange('package.json', { diff: 'x'.repeat(2000) }),
    makeChange('src/lib/core.ts', { diff: 'y'.repeat(1500) }),
    makeChange('src/utils/format.ts', { diff: 'z'.repeat(800) }),
    makeChange('README.md', { diff: 'w'.repeat(400) }),
  ];

  it('returns CompressionResult with stats', () => {
    const result = compressChanges(changes);
    expect(result.stats.total_changes).toBe(4);
    expect(result.stats.included_changes).toBeGreaterThan(0);
    expect(result.stats.estimated_tokens).toBeGreaterThan(0);
  });

  it('classifies changes by priority', () => {
    const result = compressChanges(changes);
    const priorities = result.changes.map((c) => c.priority);
    expect(priorities).toContain('critical'); // package.json
    expect(priorities).toContain('high'); // src/lib/core.ts
  });

  it('adds summaries to all changes', () => {
    const result = compressChanges(changes);
    for (const change of result.changes) {
      expect(change.summary).toBeTruthy();
      expect(typeof change.summary).toBe('string');
    }
  });

  it('respects priority threshold', () => {
    const result = compressChanges(changes, { priority_threshold: 'high' });
    const paths = result.changes.map((c) => c.path);
    // README.md (low priority) and format.ts (medium) should be omitted
    expect(paths).not.toContain('README.md');
    expect(paths).not.toContain('src/utils/format.ts');
  });

  it('includes full diffs when include_full_diff is true', () => {
    const smallChanges: FileChange[] = [
      makeChange('src/auth.ts', { diff: 'short diff' }),
    ];
    const result = compressChanges(smallChanges, { include_full_diff: true });
    expect(result.changes[0].diff).toBe('short diff');
  });

  it('handles binary files', () => {
    const withBinary: FileChange[] = [
      makeChange('image.png', { type: 'added', isBinary: true, diff: undefined }),
    ];
    const result = compressChanges(withBinary);
    expect(result.changes[0].summary).toContain('Binary');
  });

  it('handles deleted files', () => {
    const deleted: FileChange[] = [
      makeChange('old.ts', { type: 'deleted', diff: undefined }),
    ];
    const result = compressChanges(deleted);
    expect(result.changes[0].summary).toContain('deleted');
  });

  it('budget_used_pct is between 0 and 100', () => {
    const result = compressChanges(changes, { token_budget: 8000 });
    expect(result.stats.budget_used_pct).toBeGreaterThanOrEqual(0);
    expect(result.stats.budget_used_pct).toBeLessThanOrEqual(100);
  });
});
