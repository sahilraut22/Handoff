import { describe, it, expect } from 'vitest';
import { parseFrontmatter, validateHandoff, getMarkdownBody } from '../src/lib/protocol.js';

const validFrontmatter = `---
handoff_version: "2.0"
session_id: "abc-123"
created_at: "2026-03-30T10:00:00Z"
duration: "2h 30m"
working_dir: "/home/user/project"
agent: "claude"
changes:
  modified: 3
  added: 2
  deleted: 1
---

# Handoff Context

Some content here.`;

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const fm = parseFrontmatter(validFrontmatter);
    expect(fm).not.toBeNull();
    expect(fm!.handoff_version).toBe('2.0');
    expect(fm!.session_id).toBe('abc-123');
    expect(fm!.created_at).toBe('2026-03-30T10:00:00Z');
    expect(fm!.duration).toBe('2h 30m');
    expect(fm!.working_dir).toBe('/home/user/project');
    expect(fm!.agent).toBe('claude');
  });

  it('parses changes object', () => {
    const fm = parseFrontmatter(validFrontmatter);
    expect(fm!.changes.modified).toBe(3);
    expect(fm!.changes.added).toBe(2);
    expect(fm!.changes.deleted).toBe(1);
  });

  it('returns null for missing frontmatter', () => {
    expect(parseFrontmatter('# Handoff\nNo frontmatter')).toBeNull();
  });

  it('returns null for unclosed frontmatter', () => {
    expect(parseFrontmatter('---\nhandoff_version: "1.0"\n')).toBeNull();
  });

  it('parses compression block', () => {
    const md = `---
handoff_version: "2.0"
session_id: "test"
created_at: "2026-03-30T10:00:00Z"
working_dir: "/project"
changes:
  modified: 1
  added: 0
  deleted: 0
compression:
  enabled: true
  token_budget: 8000
  tokens_used: 5000
---
`;
    const fm = parseFrontmatter(md);
    expect(fm).not.toBeNull();
    expect(fm!.compression?.enabled).toBe(true);
    expect(fm!.compression?.token_budget).toBe(8000);
    expect(fm!.compression?.tokens_used).toBe(5000);
  });

  it('parses priority_files array', () => {
    const md = `---
handoff_version: "2.0"
session_id: "test"
created_at: "2026-03-30T10:00:00Z"
working_dir: "/project"
changes:
  modified: 1
  added: 0
  deleted: 0
priority_files:
  - "src/auth.ts"
  - "package.json"
---
`;
    const fm = parseFrontmatter(md);
    expect(fm!.priority_files).toEqual(['src/auth.ts', 'package.json']);
  });
});

describe('validateHandoff', () => {
  it('passes valid HANDOFF.md', () => {
    const result = validateHandoff(validFrontmatter);
    expect(result.errors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('fails when frontmatter is missing', () => {
    const result = validateHandoff('# No frontmatter');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'frontmatter')).toBe(true);
  });

  it('errors on missing session_id', () => {
    const md = validFrontmatter.replace('session_id: "abc-123"\n', '');
    const result = validateHandoff(md);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'session_id')).toBe(true);
  });

  it('errors on invalid date format', () => {
    const md = validFrontmatter.replace('"2026-03-30T10:00:00Z"', '"not-a-date"');
    const result = validateHandoff(md);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_at')).toBe(true);
  });

  it('warns when handoff is stale', () => {
    // Use a date in 2020 to guarantee staleness
    const md = validFrontmatter.replace('"2026-03-30T10:00:00Z"', '"2020-01-01T00:00:00Z"');
    const result = validateHandoff(md);
    const warning = result.errors.find((e) => e.field === 'created_at' && e.severity === 'warning');
    expect(warning).toBeTruthy();
  });

  it('warns when no changes', () => {
    const md = `---
handoff_version: "2.0"
session_id: "test"
created_at: "2026-03-30T10:00:00Z"
working_dir: "/project"
changes:
  modified: 0
  added: 0
  deleted: 0
---
`;
    const result = validateHandoff(md);
    const warning = result.errors.find((e) => e.field === 'changes' && e.severity === 'warning');
    expect(warning).toBeTruthy();
  });

  it('returns valid:true even with warnings only', () => {
    // Only warnings (stale date), no errors
    const md = `---
handoff_version: "2.0"
session_id: "test"
created_at: "2020-01-01T00:00:00Z"
working_dir: "/project"
changes:
  modified: 1
  added: 0
  deleted: 0
---
`;
    const result = validateHandoff(md);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.severity === 'warning')).toBe(true);
  });

  it('errors on invalid semver in handoff_version', () => {
    const md = validFrontmatter.replace('"2.0"', '"not.valid.semver.extra"');
    const result = validateHandoff(md);
    expect(result.errors.some((e) => e.field === 'handoff_version')).toBe(true);
  });
});

describe('getMarkdownBody', () => {
  it('returns body after frontmatter', () => {
    const body = getMarkdownBody(validFrontmatter);
    expect(body).toContain('# Handoff Context');
    expect(body).not.toContain('handoff_version');
  });

  it('returns full content when no frontmatter', () => {
    const content = '# Just Markdown\n\nNo frontmatter here.';
    expect(getMarkdownBody(content)).toBe(content);
  });
});
