import { describe, it, expect } from 'vitest';
import { resolveKey } from '../src/lib/key-map.js';

// Tests for bridge logic that don't require tmux

describe('bridge message formatting', () => {
  function formatMessage(sender: string, text: string): string {
    return `[from: ${sender}] ${text}`;
  }

  it('formats message with sender label', () => {
    const msg = formatMessage('claude', 'Review the auth code');
    expect(msg).toBe('[from: claude] Review the auth code');
  });

  it('formats message with pane ID as sender', () => {
    const msg = formatMessage('%0', 'Hello codex');
    expect(msg).toBe('[from: %0] Hello codex');
  });

  it('preserves multi-word text', () => {
    const msg = formatMessage('gemini', 'Read HANDOFF.md for full context');
    expect(msg).toBe('[from: gemini] Read HANDOFF.md for full context');
  });
});

describe('bridge key resolution', () => {
  it('resolves Enter for bridge keys command', () => {
    const keys = ['Enter'].map(resolveKey);
    expect(keys).toEqual(['Enter']);
  });

  it('resolves multiple keys', () => {
    const keys = ['Up', 'Up', 'Enter'].map(resolveKey);
    expect(keys).toEqual(['Up', 'Up', 'Enter']);
  });

  it('resolves Ctrl+C', () => {
    const keys = ['Ctrl+C'].map(resolveKey);
    expect(keys).toEqual(['C-c']);
  });

  it('resolves mixed case keys', () => {
    const keys = ['escape', 'TAB'].map(resolveKey);
    expect(keys).toEqual(['Escape', 'Tab']);
  });

  it('passes raw tmux key names through', () => {
    const keys = ['F5', 'M-x'].map(resolveKey);
    expect(keys).toEqual(['F5', 'M-x']);
  });
});

describe('bridge target resolution logic', () => {
  it('recognizes raw pane IDs by % prefix', () => {
    const identifier = '%3';
    expect(identifier.startsWith('%')).toBe(true);
  });

  it('recognizes label as non-pane-id', () => {
    const identifier = 'claude';
    expect(identifier.startsWith('%')).toBe(false);
  });
});

describe('bridge spawn - agent config lookup', () => {
  it('known agents are in registry', async () => {
    const { getAgentConfig } = await import('../src/lib/agents.js');
    expect(getAgentConfig('claude')).toBeDefined();
    expect(getAgentConfig('codex')).toBeDefined();
    expect(getAgentConfig('gemini')).toBeDefined();
    expect(getAgentConfig('unknown-agent-xyz')).toBeUndefined();
  });

  it('claude agent has correct command', async () => {
    const { getAgentConfig } = await import('../src/lib/agents.js');
    const config = getAgentConfig('claude');
    expect(config!.command).toBe('claude');
  });
});
