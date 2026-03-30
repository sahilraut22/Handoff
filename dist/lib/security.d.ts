/**
 * Validate that a user-supplied path resolves within workingDir.
 * Returns the resolved absolute path if safe.
 * Throws SecurityError(PATH_OUTSIDE_WORKSPACE) if the path escapes workingDir.
 */
export declare function safePath(workingDir: string, userPath: string): string;
/**
 * Validate an agent name. Allows alphanumeric, dash, and underscore (1–64 chars).
 * Returns the name unchanged if valid.
 * Throws SecurityError(INVALID_AGENT_NAME) if invalid.
 */
export declare function sanitizeAgentName(name: string): string;
/**
 * Scan content for common secret patterns and replace matches with [REDACTED].
 * Returns the sanitized content.
 */
export declare function redactSecrets(content: string): string;
/**
 * Validate that content does not exceed maxBytes.
 * Throws FileError(FILE_TOO_LARGE) if too large.
 */
export declare function validateContentSize(content: string, maxBytes: number, label: string): void;
/**
 * Validate handoff output content before writing.
 * Checks: non-empty, under 10MB, no null bytes.
 * Throws FileError if invalid.
 */
export declare function validateHandoffContent(content: string): void;
