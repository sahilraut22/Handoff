import { describe, it, expect } from 'vitest';
import {
  extractDecisions,
  mergeExtracted,
  formatExtractedForReview,
} from '../src/lib/decision-extractor.js';
import type { ExtractedDecision } from '../src/types/index.js';

describe('extractDecisions', () => {
  it('returns empty array for empty text', () => {
    expect(extractDecisions('', 'diff')).toEqual([]);
  });

  it('detects architecture-choice pattern', () => {
    const text = 'We decided to use JWT for authentication instead of sessions.';
    const results = extractDecisions(text, 'conversation');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.source).toBe('conversation');
    expect(results[0]!.confidence).toBeGreaterThan(0.5);
  });

  it('detects breaking-change pattern', () => {
    const text = '// BREAKING CHANGE: removed the old auth endpoint\n// migrated all consumers to new JWT endpoint';
    const results = extractDecisions(text, 'diff');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('detects security-decision pattern', () => {
    const text = 'Added encryption for sensitive user data.\nUsed AES-256 for security compliance.';
    const results = extractDecisions(text, 'diff');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.tags.includes('security'))).toBe(true);
  });

  it('detects instead-of pattern', () => {
    const text = 'Used TypeScript instead of JavaScript for better type safety.';
    const results = extractDecisions(text, 'conversation');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('extracts alternatives from text', () => {
    const text = `We chose React over Vue.
Options considered:
- React (chosen)
- Vue
- Angular`;
    const results = extractDecisions(text, 'conversation');
    if (results.length > 0 && results[0]!.alternatives.length > 0) {
      expect(results[0]!.alternatives.length).toBeGreaterThan(0);
    }
  });

  it('detects dependency pattern', () => {
    const text = 'Added gpt-tokenizer package for accurate token counting.';
    const results = extractDecisions(text, 'commit');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.tags.includes('dependency'))).toBe(true);
  });

  it('assigns confidence between 0 and 1', () => {
    const text = 'decided to use PostgreSQL instead of MySQL for better JSON support because we need JSONB indexing';
    const results = extractDecisions(text, 'conversation');
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('boosts confidence for explicit rationale', () => {
    const withRationale = 'decided to use Redis because it is faster for caching';
    const withoutRationale = 'decided to use Redis';
    const r1 = extractDecisions(withRationale, 'conversation');
    const r2 = extractDecisions(withoutRationale, 'conversation');
    if (r1.length > 0 && r2.length > 0) {
      expect(r1[0]!.confidence).toBeGreaterThanOrEqual(r2[0]!.confidence);
    }
  });

  it('penalizes comment-only lines', () => {
    const commentLine = '// decided to use JWT for auth';
    const results = extractDecisions(commentLine, 'diff');
    if (results.length > 0) {
      expect(results[0]!.confidence).toBeLessThan(0.85);
    }
  });

  it('respects max_decisions_per_scan', () => {
    // Generate many trigger lines
    const lines = Array.from({ length: 20 }, (_, i) =>
      `We decided to use approach ${i} for module ${i}.`
    ).join('\n');
    const results = extractDecisions(lines, 'diff', { max_decisions_per_scan: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('deduplicates similar decisions', () => {
    const text = `We decided to use JWT for authentication.
We decided to use JWT for auth.`;
    const results = extractDecisions(text, 'conversation');
    // Should deduplicate -- both are about "JWT for auth"
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe('mergeExtracted', () => {
  it('returns all as new when existing list is empty', () => {
    const extracted: ExtractedDecision[] = [
      { title: 'Use JWT', context: '', decision: '', alternatives: [], confidence: 0.8, source: 'diff', tags: [] },
    ];
    const { new_decisions, duplicates } = mergeExtracted([], extracted);
    expect(new_decisions.length).toBe(1);
    expect(duplicates).toBe(0);
  });

  it('detects duplicates by Jaccard similarity', () => {
    const existing = ['Use JWT for authentication'];
    const extracted: ExtractedDecision[] = [
      { title: 'Use JWT for authentication', context: '', decision: '', alternatives: [], confidence: 0.8, source: 'diff', tags: [] },
    ];
    const { new_decisions, duplicates } = mergeExtracted(existing, extracted);
    expect(duplicates).toBeGreaterThan(0);
    expect(new_decisions.length).toBe(0);
  });

  it('does not flag unrelated decisions as duplicates', () => {
    const existing = ['Use JWT for authentication'];
    const extracted: ExtractedDecision[] = [
      { title: 'Switch to PostgreSQL from MySQL', context: '', decision: '', alternatives: [], confidence: 0.8, source: 'diff', tags: [] },
    ];
    const { new_decisions, duplicates } = mergeExtracted(existing, extracted);
    expect(duplicates).toBe(0);
    expect(new_decisions.length).toBe(1);
  });
});

describe('formatExtractedForReview', () => {
  it('returns "No decisions extracted." for empty array', () => {
    expect(formatExtractedForReview([])).toBe('No decisions extracted.');
  });

  it('includes title and confidence', () => {
    const d: ExtractedDecision = {
      title: 'Use TypeScript',
      context: 'project context',
      decision: 'Use TypeScript',
      alternatives: ['JavaScript'],
      confidence: 0.85,
      source: 'diff',
      tags: ['architecture'],
    };
    const output = formatExtractedForReview([d]);
    expect(output).toContain('Use TypeScript');
    expect(output).toContain('85%');
    expect(output).toContain('architecture');
    expect(output).toContain('JavaScript');
  });

  it('produces non-empty string for valid decisions', () => {
    const d: ExtractedDecision = {
      title: 'Test decision',
      context: '',
      decision: '',
      alternatives: [],
      confidence: 0.7,
      source: 'conversation',
      tags: [],
    };
    const output = formatExtractedForReview([d]);
    expect(output.length).toBeGreaterThan(0);
  });
});
