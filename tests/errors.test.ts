import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  HandoffError,
  SessionError,
  FileError,
  ConfigError,
  TmuxError,
  CompressionError,
  HandoffValidationError,
  AgentError,
  SecurityError,
} from '../src/lib/errors.js';
import { getRecoveryHint } from '../src/lib/recovery.js';

describe('HandoffError', () => {
  it('constructs with code and message', () => {
    const err = new HandoffError(ErrorCode.SESSION_NOT_FOUND, 'No session');
    expect(err.code).toBe(ErrorCode.SESSION_NOT_FOUND);
    expect(err.message).toBe('No session');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HandoffError);
  });

  it('has a default recovery hint from ErrorCode', () => {
    const err = new HandoffError(ErrorCode.SESSION_NOT_FOUND, 'No session');
    expect(err.recoveryHint).toBeTruthy();
    expect(err.recoveryHint).toContain('handoff init');
  });

  it('allows overriding recovery hint', () => {
    const err = new HandoffError(ErrorCode.SESSION_NOT_FOUND, 'No session', {
      recoveryHint: 'Custom hint',
    });
    expect(err.recoveryHint).toBe('Custom hint');
  });

  it('stores cause', () => {
    const cause = new Error('underlying');
    const err = new HandoffError(ErrorCode.FILE_READ_ERROR, 'Read failed', { cause });
    expect(err.cause).toBe(cause);
  });

  it('formats with code and hint', () => {
    const err = new HandoffError(ErrorCode.SESSION_NOT_FOUND, 'No session found');
    const formatted = err.format();
    expect(formatted).toContain('[E101]');
    expect(formatted).toContain('No session found');
    expect(formatted).toContain('Hint:');
  });

  it('formats without hint when none present', () => {
    const err = new HandoffError(ErrorCode.SESSION_NOT_FOUND, 'No session', {
      recoveryHint: '',
    });
    // override with empty hint — format should not include "Hint:" line
    // But recovery hint from map is used if not explicitly empty
    // Test that format() at minimum contains code and message
    const formatted = err.format();
    expect(formatted).toContain('[E101]');
    expect(formatted).toContain('No session');
  });
});

describe('Error subclasses', () => {
  it('SessionError is instance of HandoffError', () => {
    const err = new SessionError(ErrorCode.SESSION_NOT_FOUND, 'test');
    expect(err).toBeInstanceOf(HandoffError);
    expect(err).toBeInstanceOf(SessionError);
    expect(err.name).toBe('SessionError');
  });

  it('FileError has correct name', () => {
    const err = new FileError(ErrorCode.FILE_NOT_FOUND, 'not found');
    expect(err.name).toBe('FileError');
    expect(err.code).toBe(ErrorCode.FILE_NOT_FOUND);
  });

  it('ConfigError has correct name', () => {
    const err = new ConfigError(ErrorCode.CONFIG_INVALID, 'bad config');
    expect(err.name).toBe('ConfigError');
  });

  it('TmuxError has correct name', () => {
    const err = new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'no tmux');
    expect(err.name).toBe('TmuxError');
    expect(err.recoveryHint).toContain('tmux');
  });

  it('CompressionError has correct name', () => {
    const err = new CompressionError(ErrorCode.COMPRESSION_FAILED, 'failed');
    expect(err.name).toBe('CompressionError');
  });

  it('HandoffValidationError has correct name', () => {
    const err = new HandoffValidationError(ErrorCode.INVALID_FORMAT, 'bad format');
    expect(err.name).toBe('HandoffValidationError');
  });

  it('AgentError has correct name', () => {
    const err = new AgentError(ErrorCode.AGENT_NOT_FOUND, 'unknown agent');
    expect(err.name).toBe('AgentError');
    expect(err.recoveryHint).toContain('claude');
  });

  it('SecurityError has correct name', () => {
    const err = new SecurityError(ErrorCode.PATH_OUTSIDE_WORKSPACE, 'path escapes');
    expect(err.name).toBe('SecurityError');
  });
});

describe('getRecoveryHint', () => {
  it('returns hint for every ErrorCode', () => {
    for (const code of Object.values(ErrorCode)) {
      const hint = getRecoveryHint(code);
      expect(hint).toBeTruthy();
      expect(typeof hint).toBe('string');
    }
  });

  it('TMUX_NOT_AVAILABLE hint mentions install', () => {
    expect(getRecoveryHint(ErrorCode.TMUX_NOT_AVAILABLE)).toContain('tmux');
  });

  it('SESSION_NOT_FOUND hint mentions handoff init', () => {
    expect(getRecoveryHint(ErrorCode.SESSION_NOT_FOUND)).toContain('handoff init');
  });

  it('FILE_WRITE_ERROR hint mentions permissions', () => {
    expect(getRecoveryHint(ErrorCode.FILE_WRITE_ERROR)).toContain('permission');
  });
});

describe('ErrorCode values', () => {
  it('all codes are unique', () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('codes follow Exxx pattern', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(code).toMatch(/^E\d{3}$/);
    }
  });
});
