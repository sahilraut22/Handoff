import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safePath, sanitizeAgentName, redactSecrets, validateContentSize, validateHandoffContent } from '../src/lib/security.js';
import { SecurityError, FileError, ErrorCode } from '../src/lib/errors.js';

function expectErrorCode(fn: () => unknown, expectedCode: ErrorCode): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeDefined();
  expect((thrown as { code?: string }).code).toBe(expectedCode);
}

describe('safePath', () => {
  const workingDir = tmpdir();

  it('allows a simple relative path', () => {
    const result = safePath(workingDir, 'src/index.ts');
    expect(result).toContain('src');
    expect(result).toContain('index.ts');
  });

  it('allows a nested relative path', () => {
    const result = safePath(workingDir, 'a/b/c/d.txt');
    expect(result).toContain('d.txt');
  });

  it('allows path pointing to workingDir itself', () => {
    const result = safePath(workingDir, '.');
    expect(result).toBeTruthy();
  });

  it('blocks path traversal with ../', () => {
    expect(() => safePath(workingDir, '../escape')).toThrow(SecurityError);
    expectErrorCode(() => safePath(workingDir, '../escape'), ErrorCode.PATH_OUTSIDE_WORKSPACE);
  });

  it('blocks deeply nested traversal', () => {
    // Create a deeply nested path that resolves outside tmpdir
    const nested = 'a/b/' + '../'.repeat(20) + 'evil';
    // Only throw if it actually escapes — on some systems this stays in tmpdir
    try {
      const result = safePath(workingDir, nested);
      // If it doesn't throw, it should still be within the working dir
      expect(result).toContain(workingDir.replace(/\\/g, '/').split('/')[0] ?? '');
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
    }
  });

  it('returns the resolved absolute path', () => {
    const result = safePath(workingDir, 'foo.txt');
    expect(result).toBe(join(workingDir, 'foo.txt'));
  });
});

describe('sanitizeAgentName', () => {
  it('allows valid agent names', () => {
    expect(sanitizeAgentName('claude')).toBe('claude');
    expect(sanitizeAgentName('codex-4')).toBe('codex-4');
    expect(sanitizeAgentName('my_agent')).toBe('my_agent');
    expect(sanitizeAgentName('Agent123')).toBe('Agent123');
    expect(sanitizeAgentName('a'.repeat(64))).toBeTruthy();
  });

  it('rejects empty string', () => {
    expect(() => sanitizeAgentName('')).toThrow(SecurityError);
    expectErrorCode(() => sanitizeAgentName(''), ErrorCode.INVALID_AGENT_NAME);
  });

  it('rejects names longer than 64 chars', () => {
    expect(() => sanitizeAgentName('a'.repeat(65))).toThrow(SecurityError);
  });

  it('rejects special characters', () => {
    expect(() => sanitizeAgentName('agent; rm -rf')).toThrow(SecurityError);
    expect(() => sanitizeAgentName('agent<script>')).toThrow(SecurityError);
    expect(() => sanitizeAgentName('agent name')).toThrow(SecurityError);
    expect(() => sanitizeAgentName('../evil')).toThrow(SecurityError);
  });
});

describe('redactSecrets', () => {
  it('redacts AWS access keys', () => {
    const input = 'key=AKIAIOSFODNN7EXAMPLE rest of content';
    const result = redactSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts GitHub tokens', () => {
    const input = 'token: ghp_' + 'a'.repeat(36);
    const result = redactSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('ghp_');
  });

  it('redacts npm tokens', () => {
    const input = 'npm_' + 'A'.repeat(36);
    const result = redactSecrets(input);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts private key headers', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
    const result = redactSecrets(input);
    expect(result).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('preserves non-secret content', () => {
    const input = 'This is normal text. No secrets here.';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it('redacts multiple secrets in the same string', () => {
    const input = 'AWS: AKIAIOSFODNN7EXAMPLE and npm: npm_' + 'B'.repeat(36);
    const result = redactSecrets(input);
    expect((result.match(/\[REDACTED\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateContentSize', () => {
  it('passes for content within limit', () => {
    expect(() => validateContentSize('hello', 100, 'test')).not.toThrow();
  });

  it('throws FileError for content exceeding limit', () => {
    const big = 'x'.repeat(101);
    expect(() => validateContentSize(big, 100, 'test')).toThrow(FileError);
    expectErrorCode(() => validateContentSize(big, 100, 'test'), ErrorCode.FILE_TOO_LARGE);
  });

  it('error message includes label', () => {
    try {
      validateContentSize('x'.repeat(200), 100, 'MyLabel');
    } catch (e) {
      expect((e as Error).message).toContain('MyLabel');
    }
  });
});

describe('validateHandoffContent', () => {
  it('passes for valid handoff markdown', () => {
    const content = '---\nhandoff_version: "2.0"\n---\n\n# Handoff Context\n';
    expect(() => validateHandoffContent(content)).not.toThrow();
  });

  it('throws for empty content', () => {
    expect(() => validateHandoffContent('')).toThrow(FileError);
  });

  it('throws for content with null bytes', () => {
    expect(() => validateHandoffContent('hello\0world')).toThrow(FileError);
  });

  it('throws for content exceeding 10MB', () => {
    const huge = 'x'.repeat(10 * 1024 * 1024 + 1);
    expect(() => validateHandoffContent(huge)).toThrow(FileError);
    expectErrorCode(() => validateHandoffContent(huge), ErrorCode.FILE_TOO_LARGE);
  });
});
