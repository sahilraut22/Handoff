import { ErrorCode } from './error-codes.js';
export { ErrorCode } from './error-codes.js';
export declare class HandoffError extends Error {
    readonly code: ErrorCode;
    readonly recoveryHint?: string;
    readonly cause?: Error;
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
    format(): string;
}
export declare class SessionError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class FileError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class ConfigError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class TmuxError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class CompressionError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class HandoffValidationError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class AgentError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
export declare class SecurityError extends HandoffError {
    constructor(code: ErrorCode, message: string, options?: {
        cause?: Error;
        recoveryHint?: string;
    });
}
