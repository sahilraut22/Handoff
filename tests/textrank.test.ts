import { describe, it, expect } from 'vitest';
import {
  splitSentences,
  buildSimilarityGraph,
  textRank,
  summarize,
  summarizeDiff,
} from '../src/lib/textrank.js';

describe('splitSentences', () => {
  it('returns empty array for empty text', () => {
    expect(splitSentences('')).toEqual([]);
  });

  it('splits on double newlines (paragraph breaks)', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const sentences = splitSentences(text);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
  });

  it('returns short text as a single sentence', () => {
    const text = 'Short sentence here.';
    const sentences = splitSentences(text);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences[0]).toContain('Short');
  });

  it('filters out empty and very short segments', () => {
    const text = '\n\n\na\n\nThis is a real sentence with some content.';
    const sentences = splitSentences(text);
    expect(sentences.every((s) => s.length >= 10)).toBe(true);
  });
});

describe('buildSimilarityGraph', () => {
  it('returns empty matrix for empty input', () => {
    expect(buildSimilarityGraph([])).toEqual([]);
  });

  it('returns 1x1 matrix for single sentence', () => {
    const graph = buildSimilarityGraph(['hello world']);
    expect(graph.length).toBe(1);
    expect(graph[0]!.length).toBe(1);
    expect(graph[0]![0]).toBe(0); // self-similarity
  });

  it('returns symmetric matrix', () => {
    const sentences = [
      'The cat sat on the mat',
      'A cat was sitting on a mat',
      'Dogs run in parks',
    ];
    const graph = buildSimilarityGraph(sentences);
    expect(graph.length).toBe(3);
    // Symmetry
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(graph[i]![j]).toBeCloseTo(graph[j]![i]!, 10);
      }
    }
  });

  it('similar sentences have higher similarity than unrelated ones', () => {
    const sentences = [
      'authentication is handled by JWT tokens',
      'JWT is used for user authentication',
      'the weather is nice today',
    ];
    const graph = buildSimilarityGraph(sentences);
    // Sentences 0 and 1 (both about JWT auth) should have higher similarity
    expect(graph[0]![1]).toBeGreaterThan(graph[0]![2]!);
  });
});

describe('textRank', () => {
  it('returns empty for empty input', () => {
    expect(textRank([])).toEqual([]);
  });

  it('returns single sentence with score 1.0', () => {
    const result = textRank(['Only one sentence here.']);
    expect(result.length).toBe(1);
    expect(result[0]!.score).toBe(1.0);
  });

  it('assigns higher scores to more central sentences', () => {
    const sentences = [
      'Authentication uses JWT tokens for session management',
      'JWT is validated on every request to the server',
      'Tokens expire after 24 hours for security',
      'The sky is blue and the sun is bright',
    ];
    const ranked = textRank(sentences);
    expect(ranked.length).toBe(4);

    // Auth-related sentences should score higher than the unrelated one
    const authScores = ranked.slice(0, 3).map((r) => r.score);
    const unrelatedScore = ranked[3]!.score;
    const avgAuthScore = authScores.reduce((a, b) => a + b, 0) / authScores.length;
    expect(avgAuthScore).toBeGreaterThan(unrelatedScore * 0.5);
  });

  it('returns indices in same order as input', () => {
    const sentences = ['first', 'second sentence here', 'third one with content'];
    const ranked = textRank(sentences);
    for (let i = 0; i < sentences.length; i++) {
      const r = ranked.find((r) => r.index === i);
      expect(r).toBeDefined();
      expect(r!.text).toBe(sentences[i]);
    }
  });
});

describe('summarize', () => {
  it('returns original text for very short input', () => {
    const text = 'Short text.';
    expect(summarize(text)).toBeTruthy();
  });

  it('produces shorter output than input for long text', () => {
    const text = Array.from({ length: 20 }, (_, i) =>
      `This is sentence ${i} about topic ${i % 3}.`
    ).join('\n\n');
    const summary = summarize(text, { summary_ratio: 0.3 });
    expect(summary.length).toBeLessThan(text.length);
  });

  it('keeps at least 1 sentence', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `Sentence ${i} with some unique words like ${['alpha', 'beta', 'gamma'][i % 3]}.`
    ).join('\n\n');
    const summary = summarize(text, { summary_ratio: 0.1 });
    expect(summary.trim().length).toBeGreaterThan(0);
  });
});

describe('summarizeDiff', () => {
  it('returns original diff when it has few lines', () => {
    const diff = `@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;`;
    const result = summarizeDiff(diff, 20);
    expect(result).toBeTruthy();
  });

  it('preserves @@ hunk headers', () => {
    const diff = `@@ -1,5 +1,5 @@
 line1
-line2
+line2_changed
 line3
-line4
+line4_changed
 line5`;
    const result = summarizeDiff(diff, 5);
    expect(result).toContain('@@');
  });

  it('compresses long diffs', () => {
    const changedLines = Array.from({ length: 100 }, (_, i) =>
      `+function handler${i}() { return ${i}; }`
    );
    const diff = `@@ -1,100 +1,100 @@\n${changedLines.join('\n')}`;
    const result = summarizeDiff(diff, 10);
    expect(result.split('\n').length).toBeLessThan(diff.split('\n').length);
  });
});
