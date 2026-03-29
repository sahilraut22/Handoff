import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateDecisionId,
  saveDecision,
  loadDecision,
  loadAllDecisions,
  searchDecisions,
  updateDecisionStatus,
  formatDecisionMarkdown,
  formatDecisionsTable,
} from '../src/lib/decisions.js';
import type { Decision } from '../src/types/index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'handoff-decisions-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const makeDecision = (overrides: Partial<Decision> = {}): Decision => ({
  id: generateDecisionId(),
  title: 'Use JWT for auth',
  status: 'accepted',
  date: '2026-03-30T10:00:00Z',
  context: 'Need stateless auth',
  decision: 'JWT with RS256',
  ...overrides,
});

describe('generateDecisionId', () => {
  it('generates 8-char alphanumeric ID', () => {
    const id = generateDecisionId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDecisionId()));
    expect(ids.size).toBeGreaterThan(90); // Allow tiny collision probability
  });
});

describe('saveDecision / loadDecision', () => {
  it('saves and loads a decision', async () => {
    const d = makeDecision({ id: 'test1234' });
    await saveDecision(tempDir, d);
    const loaded = await loadDecision(tempDir, 'test1234');
    expect(loaded.id).toBe('test1234');
    expect(loaded.title).toBe('Use JWT for auth');
    expect(loaded.status).toBe('accepted');
  });

  it('saves to .handoff/decisions/{id}.yaml', async () => {
    const d = makeDecision({ id: 'file1234' });
    const path = await saveDecision(tempDir, d);
    expect(path).toContain('.handoff');
    expect(path).toContain('decisions');
    expect(path).toContain('file1234.yaml');
  });

  it('creates directory if it does not exist', async () => {
    const d = makeDecision({ id: 'newdir12' });
    await expect(saveDecision(tempDir, d)).resolves.not.toThrow();
  });

  it('throws when loading non-existent decision', async () => {
    await expect(loadDecision(tempDir, 'notfound')).rejects.toThrow();
  });
});

describe('loadAllDecisions', () => {
  it('returns empty array when no decisions directory', async () => {
    const decisions = await loadAllDecisions(tempDir);
    expect(decisions).toEqual([]);
  });

  it('returns all saved decisions sorted by date', async () => {
    await saveDecision(tempDir, makeDecision({ id: 'aaa11111', date: '2026-03-30T12:00:00Z', title: 'B' }));
    await saveDecision(tempDir, makeDecision({ id: 'bbb22222', date: '2026-03-28T12:00:00Z', title: 'A' }));
    await saveDecision(tempDir, makeDecision({ id: 'ccc33333', date: '2026-03-29T12:00:00Z', title: 'C' }));

    const decisions = await loadAllDecisions(tempDir);
    expect(decisions).toHaveLength(3);
    expect(decisions[0].title).toBe('A');
    expect(decisions[1].title).toBe('C');
    expect(decisions[2].title).toBe('B');
  });

  it('skips malformed YAML files', async () => {
    // Create a malformed file manually
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(tempDir, '.handoff', 'decisions'), { recursive: true });
    await writeFile(join(tempDir, '.handoff', 'decisions', 'bad.yaml'), 'not: valid: yaml: file', 'utf-8');
    await saveDecision(tempDir, makeDecision({ id: 'good1234' }));

    const decisions = await loadAllDecisions(tempDir);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].id).toBe('good1234');
  });
});

describe('searchDecisions', () => {
  beforeEach(async () => {
    await saveDecision(tempDir, makeDecision({
      id: 'auth1234', title: 'Use JWT for auth', context: 'Need stateless auth',
      decision: 'JWT with RS256 signing',
      tags: ['auth', 'security'],
    }));
    await saveDecision(tempDir, makeDecision({
      id: 'db001234', title: 'Use PostgreSQL', context: 'Need ACID guarantees',
      decision: 'PostgreSQL with connection pooling',
      tags: ['database', 'storage'],
    }));
    await saveDecision(tempDir, makeDecision({
      id: 'cache123', title: 'Use Redis for caching', context: 'Need fast reads',
      decision: 'Redis cluster with LRU eviction',
      tags: ['cache', 'performance'],
    }));
  });

  it('searches by title', async () => {
    const results = await searchDecisions(tempDir, 'JWT');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('auth1234');
  });

  it('searches by context', async () => {
    const results = await searchDecisions(tempDir, 'ACID');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('db001234');
  });

  it('searches by tag', async () => {
    const results = await searchDecisions(tempDir, 'security');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('auth1234');
  });

  it('returns all on broad query', async () => {
    const results = await searchDecisions(tempDir, 'Need');
    expect(results).toHaveLength(3);
  });

  it('returns empty on no match', async () => {
    const results = await searchDecisions(tempDir, 'kubernetes');
    expect(results).toHaveLength(0);
  });

  it('is case insensitive', async () => {
    const results = await searchDecisions(tempDir, 'jwt');
    expect(results).toHaveLength(1);
  });
});

describe('updateDecisionStatus', () => {
  it('updates status of existing decision', async () => {
    const d = makeDecision({ id: 'upd12345', status: 'proposed' });
    await saveDecision(tempDir, d);

    await updateDecisionStatus(tempDir, 'upd12345', 'accepted');
    const updated = await loadDecision(tempDir, 'upd12345');
    expect(updated.status).toBe('accepted');
  });
});

describe('formatDecisionMarkdown', () => {
  it('renders required fields', () => {
    const d = makeDecision({ id: 'fmt12345' });
    const md = formatDecisionMarkdown(d);
    expect(md).toContain('[fmt12345]');
    expect(md).toContain('Use JWT for auth');
    expect(md).toContain('**Status:** accepted');
    expect(md).toContain('Need stateless auth');
    expect(md).toContain('JWT with RS256');
  });

  it('renders alternatives when present', () => {
    const d = makeDecision({ alternatives: ['Option A', 'Option B'] });
    const md = formatDecisionMarkdown(d);
    expect(md).toContain('Option A');
    expect(md).toContain('Option B');
  });

  it('renders consequences when present', () => {
    const d = makeDecision({ consequences: 'Must handle refresh' });
    const md = formatDecisionMarkdown(d);
    expect(md).toContain('Must handle refresh');
  });

  it('renders supersedes when present', () => {
    const d = makeDecision({ supersedes: 'old12345' });
    const md = formatDecisionMarkdown(d);
    expect(md).toContain('old12345');
  });
});

describe('formatDecisionsTable', () => {
  it('returns message for empty array', () => {
    expect(formatDecisionsTable([])).toBe('No decisions recorded.');
  });

  it('renders markdown table', () => {
    const d = makeDecision({ id: 'tbl12345', tags: ['auth'] });
    const table = formatDecisionsTable([d]);
    expect(table).toContain('| ID |');
    expect(table).toContain('tbl12345');
    expect(table).toContain('auth');
  });

  it('truncates long titles', () => {
    const d = makeDecision({ title: 'A'.repeat(60) });
    const table = formatDecisionsTable([d]);
    expect(table).toContain('...');
  });
});
