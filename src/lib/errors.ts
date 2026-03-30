import { ErrorCode } from './error-codes.js';
import { getRecoveryHint } from './recovery.js';

export { ErrorCode } from './error-codes.js';

export class HandoffError extends Error {
  readonly code: ErrorCode;
  readonly recoveryHint?: string;
  override readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: Error; recoveryHint?: string }
  ) {
    super(message);
    this.name = 'HandoffError';
    this.code = code;
    this.cause = options?.cause;
    // Use provided hint, or fall back to default for the code; allow explicit '' to suppress
    this.recoveryHint = options?.recoveryHint !== undefined
      ? options.recoveryHint
      : getRecoveryHint(code);
  }

  format(): string {
    let out = `[${this.code}] ${this.message}`;
    if (this.recoveryHint) {
      out += `\n  Hint: ${this.recoveryHint}`;
    }
    return out;
  }
}

export class SessionError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'SessionError';
  }
}

export class FileError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'FileError';
  }
}

export class ConfigError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'ConfigError';
  }
}

export class TmuxError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'TmuxError';
  }
}

export class CompressionError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'CompressionError';
  }
}

export class HandoffValidationError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'HandoffValidationError';
  }
}

export class AgentError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'AgentError';
  }
}

export class SecurityError extends HandoffError {
  constructor(code: ErrorCode, message: string, options?: { cause?: Error; recoveryHint?: string }) {
    super(code, message, options);
    this.name = 'SecurityError';
  }
}
