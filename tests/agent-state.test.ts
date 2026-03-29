import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadAgentState,
  saveAgentState,
  getAgentKnowledge,
  updateAgentKnowledge,
  computeDelta,
} from '../src/lib/agent-state.js';
import type { FileChange } from '../src/types/index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'handoff-agent-state-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const makeChange = (path: string, diff = 'some diff content'): FileChange => ({
  path,
  type: 'modified',
  diff,
  linesAdded: 1,
  linesRemoved: 1,
});

describe('loadAgentState', () => {
  it('returns empty state for new directory', async () => {
    const state = await loadAgentState(tempDir);
    expect(state.version).toBe('1.0');
    expect(Object.keys(state.agents)).toHaveLength(0);
  });

  it('returns empty state when file does not exist', async () => {
    const state = await loadAgentState(join(tempDir, 'nonexistent'));
    expect(state.agents).toEqual({});
  });
});

describe('saveAgentState / loadAgentState roundtrip', () => {
  it('saves and reloads state', async () => {
    const state = await loadAgentState(tempDir);
    updateAgentKnowledge(
      state,
      'claude',
      [makeChange('src/auth.ts')],
      ['d001', 'd002'],
      { headline: 'Auth done' }
    );
    await saveAgentState(tempDir, state);

    const loaded = await loadAgentState(tempDir);
    expect(loaded.agents['claude']).toBeDefined();
    expect(loaded.agents['claude'].knownDecisions).toContain('d001');
    expect(loaded.agents['claude'].knownDecisions).toContain('d002');
    expect(loaded.agents['claude'].knownContext.headline).toBe('Auth done');
  });

  it('stores file hashes', async () => {
    const state = await loadAgentState(tempDir);
    updateAgentKnowledge(state, 'codex', [makeChange('src/api.ts', 'diff content')], [], {});
    await saveAgentState(tempDir, state);

    const loaded = await loadAgentState(tempDir);
    expect(loaded.agents['codex'].knownFileHashes['src/api.ts']).toBeDefined();
  });

  it('tracks lastHandoff timestamp', async () => {
    const before = new Date().toISOString();
    const state = await loadAgentState(tempDir);
    updateAgentKnowledge(state, 'gemini', [], [], {});
    await saveAgentState(tempDir, state);

    const loaded = await loadAgentState(tempDir);
    const after = new Date().toISOString();
    expect(loaded.agents['gemini'].lastHandoff >= before).toBe(true);
    expect(loaded.agents['gemini'].lastHandoff <= after).toBe(true);
  });
});

describe('getAgentKnowledge', () => {
  it('returns null for unknown agent', async () => {
    const state = await loadAgentState(tempDir);
    expect(getAgentKnowledge(state, 'unknown')).toBeNull();
  });

  it('returns knowledge for known agent', async () => {
    const state = await loadAgentState(tempDir);
    updateAgentKnowledge(state, 'claude', [], ['d1'], {});
    const knowledge = getAgentKnowledge(state, 'claude');
    expect(knowledge).not.toBeNull();
    expect(knowledge!.knownDecisions).toContain('d1');
  });
});

describe('computeDelta', () => {
  it('returns full handoff for unknown agent (null knowledge)', () => {
    const changes = [makeChange('a.ts'), makeChange('b.ts')];
    const delta = computeDelta(changes, ['d1', 'd2'], null);
    expect(delta.isFullHandoff).toBe(true);
    expect(delta.newChanges).toHaveLength(2);
    expect(delta.newDecisions).toEqual(['d1', 'd2']);
    expect(delta.unchangedCount).toBe(0);
  });

  it('filters out already-known decisions', () => {
    const state = { version: '1.0' as const, agents: {} };
    updateAgentKnowledge(state, 'claude', [], ['d1'], {});
    const knowledge = getAgentKnowledge(state, 'claude');

    const delta = computeDelta([], ['d1', 'd2', 'd3'], knowledge);
    expect(delta.newDecisions).toEqual(['d2', 'd3']);
    expect(delta.newDecisions).not.toContain('d1');
  });

  it('filters out unchanged files by diff hash', () => {
    const changes = [makeChange('a.ts', 'diff A'), makeChange('b.ts', 'diff B')];
    const state = { version: '1.0' as const, agents: {} };
    updateAgentKnowledge(state, 'claude', changes, [], {});
    const knowledge = getAgentKnowledge(state, 'claude');

    // Same diffs → should all be filtered
    const delta = computeDelta(changes, [], knowledge);
    expect(delta.unchangedCount).toBe(2);
    expect(delta.newChanges).toHaveLength(0);
    expect(delta.isFullHandoff).toBe(false);
  });

  it('includes changed files even if previously known', () => {
    const original = makeChange('a.ts', 'original diff');
    const state = { version: '1.0' as const, agents: {} };
    updateAgentKnowledge(state, 'claude', [original], [], {});
    const knowledge = getAgentKnowledge(state, 'claude');

    const modified = makeChange('a.ts', 'modified diff content');
    const delta = computeDelta([modified], [], knowledge);
    expect(delta.newChanges).toHaveLength(1);
  });

  it('includes files without diffs always', () => {
    const noDiff: FileChange = { path: 'binary.png', type: 'added', isBinary: true };
    const state = { version: '1.0' as const, agents: {} };
    updateAgentKnowledge(state, 'claude', [noDiff], [], {});
    const knowledge = getAgentKnowledge(state, 'claude');

    const delta = computeDelta([noDiff], [], knowledge);
    // No diff to hash → always considered new
    expect(delta.newChanges).toHaveLength(1);
  });
});
