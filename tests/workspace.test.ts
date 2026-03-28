import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadWorkspaceState, saveWorkspaceState } from '../src/lib/workspace.js';
import type { WorkspaceState } from '../src/types/index.js';

function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    session_name: 'handoff',
    created_at: new Date().toISOString(),
    working_dir: '/test/project',
    panes: [
      { agent_name: 'claude', pane_id: '%0', label: 'claude' },
      { agent_name: 'codex', pane_id: '%1', label: 'codex' },
      { agent_name: 'control', pane_id: '%2', label: 'control' },
    ],
    ...overrides,
  };
}

describe('workspace state persistence', () => {
  it('saves and loads workspace state correctly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-workspace-'));
    await mkdir(join(dir, '.handoff'), { recursive: true });

    const state = makeState({ working_dir: dir });
    await saveWorkspaceState(dir, state);

    const loaded = await loadWorkspaceState(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.session_name).toBe('handoff');
    expect(loaded!.panes).toHaveLength(3);
    expect(loaded!.panes[0].agent_name).toBe('claude');
  });

  it('returns null when workspace.json does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-workspace-'));
    const result = await loadWorkspaceState(dir);
    expect(result).toBeNull();
  });

  it('round-trips all fields correctly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-workspace-'));
    const state = makeState({
      session_name: 'my-session',
      working_dir: dir,
      panes: [{ agent_name: 'gemini', pane_id: '%5', label: 'gemini' }],
    });

    await saveWorkspaceState(dir, state);
    const loaded = await loadWorkspaceState(dir);

    expect(loaded!.session_name).toBe('my-session');
    expect(loaded!.panes).toHaveLength(1);
    expect(loaded!.panes[0].pane_id).toBe('%5');
  });

  it('creates .handoff directory if missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handoff-workspace-'));
    // No .handoff dir created
    const state = makeState({ working_dir: dir });
    await expect(saveWorkspaceState(dir, state)).resolves.toBeUndefined();

    const loaded = await loadWorkspaceState(dir);
    expect(loaded).not.toBeNull();
  });
});
