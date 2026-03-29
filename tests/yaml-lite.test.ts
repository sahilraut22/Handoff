import { describe, it, expect } from 'vitest';
import { serializeDecision, parseDecision } from '../src/lib/yaml-lite.js';
import type { Decision } from '../src/types/index.js';

const baseDecision: Decision = {
  id: 'abc12345',
  title: 'Use JWT for session management',
  status: 'accepted',
  date: '2026-03-30T10:00:00Z',
  context: 'Need stateless auth for horizontal scaling',
  decision: 'JWT with RS256, 15min access tokens',
};

describe('serializeDecision', () => {
  it('serializes required fields', () => {
    const yaml = serializeDecision(baseDecision);
    expect(yaml).toContain('id: abc12345');
    expect(yaml).toContain('title: Use JWT for session management');
    expect(yaml).toContain('status: accepted');
    expect(yaml).toContain('date: "2026-03-30T10:00:00Z"');
    expect(yaml).toContain('context: Need stateless auth for horizontal scaling');
    expect(yaml).toContain('decision: JWT with RS256');
  });

  it('serializes optional string arrays', () => {
    const d: Decision = {
      ...baseDecision,
      alternatives: ['Session cookies', 'OAuth2 only'],
      tags: ['auth', 'security'],
    };
    const yaml = serializeDecision(d);
    expect(yaml).toContain('alternatives:');
    expect(yaml).toContain('  - Session cookies');
    expect(yaml).toContain('  - OAuth2 only');
    expect(yaml).toContain('tags:');
    expect(yaml).toContain('  - auth');
    expect(yaml).toContain('  - security');
  });

  it('serializes optional string fields', () => {
    const d: Decision = {
      ...baseDecision,
      consequences: 'Must handle token refresh',
      supersedes: 'old1234',
      agent: 'claude',
    };
    const yaml = serializeDecision(d);
    expect(yaml).toContain('consequences: Must handle token refresh');
    expect(yaml).toContain('supersedes: old1234');
    expect(yaml).toContain('agent: claude');
  });

  it('quotes strings with special characters', () => {
    const d: Decision = {
      ...baseDecision,
      title: 'Use "JWT" for auth: reason',
    };
    const yaml = serializeDecision(d);
    expect(yaml).toContain('title: "Use \\"JWT\\" for auth: reason"');
  });

  it('omits undefined optional fields', () => {
    const yaml = serializeDecision(baseDecision);
    expect(yaml).not.toContain('alternatives');
    expect(yaml).not.toContain('consequences');
    expect(yaml).not.toContain('tags');
    expect(yaml).not.toContain('supersedes');
    expect(yaml).not.toContain('agent');
  });

  it('ends with newline', () => {
    const yaml = serializeDecision(baseDecision);
    expect(yaml.endsWith('\n')).toBe(true);
  });
});

describe('parseDecision', () => {
  it('parses a minimal decision', () => {
    const yaml = serializeDecision(baseDecision);
    const parsed = parseDecision(yaml);
    expect(parsed.id).toBe('abc12345');
    expect(parsed.title).toBe('Use JWT for session management');
    expect(parsed.status).toBe('accepted');
    expect(parsed.date).toBe('2026-03-30T10:00:00Z');
    expect(parsed.context).toBe('Need stateless auth for horizontal scaling');
    expect(parsed.decision).toBe('JWT with RS256, 15min access tokens');
  });

  it('parses string arrays', () => {
    const d: Decision = {
      ...baseDecision,
      alternatives: ['Session cookies', 'OAuth2 only'],
      tags: ['auth', 'security'],
    };
    const parsed = parseDecision(serializeDecision(d));
    expect(parsed.alternatives).toEqual(['Session cookies', 'OAuth2 only']);
    expect(parsed.tags).toEqual(['auth', 'security']);
  });

  it('parses optional fields', () => {
    const d: Decision = {
      ...baseDecision,
      consequences: 'Must handle token refresh',
      supersedes: 'old1234',
      agent: 'claude',
    };
    const parsed = parseDecision(serializeDecision(d));
    expect(parsed.consequences).toBe('Must handle token refresh');
    expect(parsed.supersedes).toBe('old1234');
    expect(parsed.agent).toBe('claude');
  });

  it('roundtrip preserves all fields', () => {
    const original: Decision = {
      id: 'test5678',
      title: 'Complex: decision with "quotes"',
      status: 'proposed',
      date: '2026-01-01T00:00:00Z',
      context: 'We needed to decide something important',
      decision: 'Go with option A',
      alternatives: ['Option B', 'Option C: the third way'],
      consequences: 'Some tradeoffs apply',
      tags: ['perf', 'api', 'v2'],
      supersedes: 'abcd1234',
      agent: 'codex',
    };
    const parsed = parseDecision(serializeDecision(original));
    expect(parsed.id).toBe(original.id);
    expect(parsed.title).toBe(original.title);
    expect(parsed.status).toBe(original.status);
    expect(parsed.date).toBe(original.date);
    expect(parsed.context).toBe(original.context);
    expect(parsed.decision).toBe(original.decision);
    expect(parsed.alternatives).toEqual(original.alternatives);
    expect(parsed.consequences).toBe(original.consequences);
    expect(parsed.tags).toEqual(original.tags);
    expect(parsed.supersedes).toBe(original.supersedes);
    expect(parsed.agent).toBe(original.agent);
  });

  it('throws on missing required fields', () => {
    expect(() => parseDecision('id: abc\ntitle: test\n')).toThrow('Missing required field');
  });

  it('throws on invalid status', () => {
    const yaml = serializeDecision(baseDecision).replace('status: accepted', 'status: invalid');
    expect(() => parseDecision(yaml)).toThrow('Invalid status');
  });

  it('handles all valid statuses', () => {
    const statuses = ['accepted', 'proposed', 'superseded', 'deprecated'] as const;
    for (const status of statuses) {
      const d = { ...baseDecision, status };
      const parsed = parseDecision(serializeDecision(d));
      expect(parsed.status).toBe(status);
    }
  });

  it('handles empty arrays', () => {
    const d: Decision = { ...baseDecision, alternatives: [], tags: [] };
    // Empty arrays are omitted from serialization
    const yaml = serializeDecision(d);
    expect(yaml).not.toContain('alternatives:');
    expect(yaml).not.toContain('tags:');
  });
});
