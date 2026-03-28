import { describe, it, expect } from 'vitest';
import { getAgentConfig, listKnownAgents, detectAgents, findAgent, AGENT_REGISTRY } from '../src/lib/agents.js';
import type { TmuxPane } from '../src/types/index.js';

function makePane(overrides: Partial<TmuxPane> = {}): TmuxPane {
  return {
    pane_id: '%0',
    pane_title: '',
    pane_pid: '1234',
    pane_current_command: 'bash',
    window_name: 'win',
    session_name: 'handoff',
    active: true,
    ...overrides,
  };
}

describe('AGENT_REGISTRY', () => {
  it('contains known agents', () => {
    expect(AGENT_REGISTRY.claude).toBeDefined();
    expect(AGENT_REGISTRY.codex).toBeDefined();
    expect(AGENT_REGISTRY.gemini).toBeDefined();
    expect(AGENT_REGISTRY.aider).toBeDefined();
  });

  it('claude has correct command and exitCommand', () => {
    expect(AGENT_REGISTRY.claude.command).toBe('claude');
    expect(AGENT_REGISTRY.claude.exitCommand).toBe('/exit');
    expect(AGENT_REGISTRY.claude.memoryFile).toBe('CLAUDE.md');
  });
});

describe('getAgentConfig', () => {
  it('returns config for known agent', () => {
    const config = getAgentConfig('claude');
    expect(config).toBeDefined();
    expect(config!.command).toBe('claude');
    expect(config!.processName).toBe('claude');
  });

  it('returns undefined for unknown agent with no custom agents', () => {
    expect(getAgentConfig('nonexistent')).toBeUndefined();
  });

  it('merges custom config over registry defaults', () => {
    const config = getAgentConfig('claude', { claude: { exitCommand: '/quit' } });
    expect(config!.exitCommand).toBe('/quit');
    expect(config!.command).toBe('claude'); // default preserved
  });

  it('returns custom-only agent if command and processName provided', () => {
    const config = getAgentConfig('myagent', {
      myagent: { command: 'myagent --interactive', processName: 'myagent' },
    });
    expect(config).toBeDefined();
    expect(config!.command).toBe('myagent --interactive');
  });

  it('returns undefined for custom-only agent missing required fields', () => {
    const config = getAgentConfig('myagent', { myagent: { memoryFile: 'MY.md' } });
    expect(config).toBeUndefined();
  });
});

describe('listKnownAgents', () => {
  it('returns all built-in agent names', () => {
    const names = listKnownAgents();
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('gemini');
    expect(names).toContain('aider');
  });

  it('includes custom agents', () => {
    const names = listKnownAgents({ myagent: { command: 'myagent', processName: 'myagent' } });
    expect(names).toContain('myagent');
    expect(names).toContain('claude');
  });

  it('returns sorted names', () => {
    const names = listKnownAgents();
    expect(names).toEqual([...names].sort());
  });
});

describe('detectAgents', () => {
  it('detects claude by process name', () => {
    const panes = [makePane({ pane_current_command: 'claude', pane_id: '%0' })];
    const agents = detectAgents(panes);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('claude');
  });

  it('does not detect non-agent processes', () => {
    const panes = [makePane({ pane_current_command: 'vim' })];
    expect(detectAgents(panes)).toHaveLength(0);
  });

  it('detects multiple agents', () => {
    const panes = [
      makePane({ pane_id: '%0', pane_current_command: 'claude' }),
      makePane({ pane_id: '%1', pane_current_command: 'codex' }),
    ];
    const agents = detectAgents(panes);
    expect(agents).toHaveLength(2);
  });
});

describe('findAgent', () => {
  it('finds by pane title (label) first', () => {
    const panes = [makePane({ pane_title: 'claude', pane_current_command: 'bash' })];
    const agent = findAgent('claude', panes);
    expect(agent).toBeDefined();
    expect(agent!.label).toBe('claude');
  });

  it('finds by process name if no label match', () => {
    const panes = [makePane({ pane_current_command: 'codex' })];
    const agent = findAgent('codex', panes);
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('codex');
  });

  it('finds by pane ID as fallback', () => {
    const panes = [makePane({ pane_id: '%5', pane_current_command: 'bash' })];
    const agent = findAgent('%5', panes);
    expect(agent).toBeDefined();
    expect(agent!.pane.pane_id).toBe('%5');
  });

  it('returns undefined if no match', () => {
    const panes = [makePane({ pane_current_command: 'bash' })];
    expect(findAgent('nonexistent', panes)).toBeUndefined();
  });
});
