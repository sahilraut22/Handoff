import { resolve, relative } from 'node:path';
import { SecurityError, FileError, ErrorCode } from './errors.js';

/**
 * Validate that a user-supplied path resolves within workingDir.
 * Returns the resolved absolute path if safe.
 * Throws SecurityError(PATH_OUTSIDE_WORKSPACE) if the path escapes workingDir.
 */
export function safePath(workingDir: string, userPath: string): string {
  const resolvedWorkingDir = resolve(workingDir);
  const resolvedPath = resolve(workingDir, userPath);
  const rel = relative(resolvedWorkingDir, resolvedPath);

  // rel starts with '..' if it escapes, or is absolute on Windows when drives differ
  if (rel.startsWith('..') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) {
    throw new SecurityError(
      ErrorCode.PATH_OUTSIDE_WORKSPACE,
      `Path "${userPath}" resolves outside working directory.`
    );
  }

  return resolvedPath;
}

/**
 * Validate an agent name. Allows alphanumeric, dash, and underscore (1–64 chars).
 * Returns the name unchanged if valid.
 * Throws SecurityError(INVALID_AGENT_NAME) if invalid.
 */
export function sanitizeAgentName(name: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    throw new SecurityError(
      ErrorCode.INVALID_AGENT_NAME,
      `Invalid agent name: "${name}".`
    );
  }
  return name;
}

// Common secret patterns
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key',    pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token',      pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: 'npm Token',         pattern: /npm_[A-Za-z0-9]{36,}/g },
  { name: 'Private Key Header', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'Bearer Token',      pattern: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g },
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|secret|token|password|credential)\s*[=:]\s*['"]?[A-Za-z0-9_\-/.+=]{20,}['"]?/gi,
  },
];

/**
 * Scan content for common secret patterns and replace matches with [REDACTED].
 * Returns the sanitized content.
 */
export function redactSecrets(content: string): string {
  let result = content;
  for (const { pattern } of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Validate that content does not exceed maxBytes.
 * Throws FileError(FILE_TOO_LARGE) if too large.
 */
export function validateContentSize(content: string, maxBytes: number, label: string): void {
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes > maxBytes) {
    throw new FileError(
      ErrorCode.FILE_TOO_LARGE,
      `${label} exceeds size limit: ${bytes.toLocaleString()} bytes (max ${maxBytes.toLocaleString()} bytes).`
    );
  }
}

const MAX_HANDOFF_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validate handoff output content before writing.
 * Checks: non-empty, under 10MB, no null bytes.
 * Throws FileError if invalid.
 */
export function validateHandoffContent(content: string): void {
  if (!content || content.length === 0) {
    throw new FileError(ErrorCode.FILE_WRITE_ERROR, 'Handoff output is empty.');
  }
  validateContentSize(content, MAX_HANDOFF_BYTES, 'Handoff output');
  if (content.includes('\0')) {
    throw new FileError(ErrorCode.FILE_WRITE_ERROR, 'Handoff output contains null bytes (binary data).');
  }
}
