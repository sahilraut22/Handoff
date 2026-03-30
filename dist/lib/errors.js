import { getRecoveryHint } from './recovery.js';
export { ErrorCode } from './error-codes.js';
export class HandoffError extends Error {
    code;
    recoveryHint;
    cause;
    constructor(code, message, options) {
        super(message);
        this.name = 'HandoffError';
        this.code = code;
        this.cause = options?.cause;
        // Use provided hint, or fall back to default for the code; allow explicit '' to suppress
        this.recoveryHint = options?.recoveryHint !== undefined
            ? options.recoveryHint
            : getRecoveryHint(code);
    }
    format() {
        let out = `[${this.code}] ${this.message}`;
        if (this.recoveryHint) {
            out += `\n  Hint: ${this.recoveryHint}`;
        }
        return out;
    }
}
export class SessionError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'SessionError';
    }
}
export class FileError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'FileError';
    }
}
export class ConfigError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'ConfigError';
    }
}
export class TmuxError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'TmuxError';
    }
}
export class CompressionError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'CompressionError';
    }
}
export class HandoffValidationError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'HandoffValidationError';
    }
}
export class AgentError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'AgentError';
    }
}
export class SecurityError extends HandoffError {
    constructor(code, message, options) {
        super(code, message, options);
        this.name = 'SecurityError';
    }
}
//# sourceMappingURL=errors.js.map