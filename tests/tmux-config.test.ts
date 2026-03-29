import { describe, it, expect } from 'vitest';
import { generateTmuxConfig } from '../src/lib/tmux-config.js';

describe('generateTmuxConfig', () => {
  it('includes version marker', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('# handoff-tmux-config v1');
  });

  it('enables mouse by default', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('set -g mouse on');
  });

  it('disables mouse when option is false', () => {
    const config = generateTmuxConfig({ mouse: false });
    expect(config).not.toContain('set -g mouse on');
  });

  it('sets scrollback history', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('set -g history-limit 10000');
  });

  it('uses custom scrollback', () => {
    const config = generateTmuxConfig({ scrollback: 5000 });
    expect(config).toContain('set -g history-limit 5000');
  });

  it('includes pane label settings by default', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('set -g pane-border-status top');
    expect(config).toContain('pane-border-format');
    expect(config).toContain('pane-active-border-style');
  });

  it('excludes pane labels when disabled', () => {
    const config = generateTmuxConfig({ paneLabels: false });
    expect(config).not.toContain('set -g pane-border-status');
  });

  it('includes keybindings by default', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('bind -n M-i select-pane -U');
    expect(config).toContain('bind -n M-k select-pane -D');
    expect(config).toContain('bind -n M-j select-pane -L');
    expect(config).toContain('bind -n M-l select-pane -R');
    expect(config).toContain('bind -n M-n split-window');
    expect(config).toContain('bind -n M-w kill-pane');
    expect(config).toContain('bind -n M-Tab copy-mode');
  });

  it('excludes keybindings when disabled', () => {
    const config = generateTmuxConfig({ keybindings: false });
    expect(config).not.toContain('bind -n M-i');
  });

  it('includes clipboard integration by default', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('pbcopy');
    expect(config).toContain('xclip');
  });

  it('excludes clipboard when disabled', () => {
    const config = generateTmuxConfig({ clipboard: false });
    expect(config).not.toContain('pbcopy');
    expect(config).not.toContain('xclip');
  });

  it('includes vi mode', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('set -g mode-keys vi');
  });

  it('sets escape time to 0', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('set -sg escape-time 0');
  });

  it('includes heavy borders directive', () => {
    const config = generateTmuxConfig();
    expect(config).toContain('pane-border-lines heavy');
  });
});
