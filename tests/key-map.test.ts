import { describe, it, expect } from 'vitest';
import { resolveKey, listKeys } from '../src/lib/key-map.js';

describe('resolveKey', () => {
  it('resolves Enter', () => {
    expect(resolveKey('Enter')).toBe('Enter');
    expect(resolveKey('enter')).toBe('Enter');
    expect(resolveKey('ENTER')).toBe('Enter');
  });

  it('resolves return as Enter', () => {
    expect(resolveKey('return')).toBe('Enter');
  });

  it('resolves Escape variants', () => {
    expect(resolveKey('escape')).toBe('Escape');
    expect(resolveKey('esc')).toBe('Escape');
    expect(resolveKey('Escape')).toBe('Escape');
  });

  it('resolves Ctrl+ combos', () => {
    expect(resolveKey('ctrl+c')).toBe('C-c');
    expect(resolveKey('Ctrl+C')).toBe('C-c');
    expect(resolveKey('ctrl+d')).toBe('C-d');
    expect(resolveKey('ctrl+z')).toBe('C-z');
  });

  it('resolves arrow keys', () => {
    expect(resolveKey('up')).toBe('Up');
    expect(resolveKey('down')).toBe('Down');
    expect(resolveKey('left')).toBe('Left');
    expect(resolveKey('right')).toBe('Right');
  });

  it('resolves special keys', () => {
    expect(resolveKey('tab')).toBe('Tab');
    expect(resolveKey('space')).toBe('Space');
    expect(resolveKey('backspace')).toBe('BSpace');
    expect(resolveKey('delete')).toBe('DC');
    expect(resolveKey('home')).toBe('Home');
    expect(resolveKey('end')).toBe('End');
    expect(resolveKey('pageup')).toBe('PageUp');
    expect(resolveKey('pagedown')).toBe('PageDown');
  });

  it('passes unknown keys through unchanged', () => {
    expect(resolveKey('F5')).toBe('F5');
    expect(resolveKey('C-x')).toBe('C-x');
    expect(resolveKey('some-key')).toBe('some-key');
  });
});

describe('listKeys', () => {
  it('returns sorted list of key names', () => {
    const keys = listKeys();
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain('enter');
    expect(keys).toContain('escape');
    expect(keys).toContain('ctrl+c');
    expect(keys).toContain('tab');
  });
});
