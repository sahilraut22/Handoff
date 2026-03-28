import { describe, it, expect } from 'vitest';
import { boxTop, boxBottom, boxDivider, boxRow, formatTable, formatStatusSymbol } from '../src/lib/ui.js';

describe('boxTop', () => {
  it('starts with top-left corner and ends with top-right corner', () => {
    const line = boxTop(10);
    expect(line[0]).toBe('\u250c');
    expect(line[line.length - 1]).toBe('\u2510');
    expect(line).toHaveLength(10);
  });
});

describe('boxBottom', () => {
  it('starts with bottom-left corner and ends with bottom-right corner', () => {
    const line = boxBottom(10);
    expect(line[0]).toBe('\u2514');
    expect(line[line.length - 1]).toBe('\u2518');
    expect(line).toHaveLength(10);
  });
});

describe('boxDivider', () => {
  it('starts with left-T and ends with right-T', () => {
    const line = boxDivider(10);
    expect(line[0]).toBe('\u251c');
    expect(line[line.length - 1]).toBe('\u2524');
    expect(line).toHaveLength(10);
  });
});

describe('boxRow', () => {
  it('wraps content in vertical bars', () => {
    const row = boxRow('hello', 15);
    expect(row[0]).toBe('\u2502');
    expect(row[row.length - 1]).toBe('\u2502');
  });

  it('truncates long content with ellipsis', () => {
    const row = boxRow('a very long string here', 12);
    expect(row).toContain('\u2026');
    expect(row).toHaveLength(12);
  });

  it('pads short content to fill width', () => {
    const row = boxRow('hi', 10);
    expect(row).toHaveLength(10);
  });
});

describe('formatTable', () => {
  it('returns a string with top and bottom borders', () => {
    const table = formatTable(['Name', 'Status'], [['claude', 'active'], ['codex', 'idle']]);
    expect(table).toContain('\u250c');
    expect(table).toContain('\u2518');
    expect(table).toContain('Name');
    expect(table).toContain('claude');
    expect(table).toContain('codex');
  });

  it('handles empty rows', () => {
    const table = formatTable(['Col A', 'Col B'], []);
    expect(table).toContain('Col A');
    expect(table).toContain('\u2514');
  });

  it('handles single column', () => {
    const table = formatTable(['Item'], [['one'], ['two']]);
    expect(table).toContain('one');
    expect(table).toContain('two');
  });
});

describe('formatStatusSymbol', () => {
  it('returns bullet for active', () => {
    expect(formatStatusSymbol('active')).toContain('\u25cf');
  });

  it('returns open circle for idle', () => {
    expect(formatStatusSymbol('idle')).toContain('\u25cb');
  });

  it('returns question mark for unknown', () => {
    expect(formatStatusSymbol('unknown')).toContain('?');
  });
});
