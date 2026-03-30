/**
 * HANDOFF.md protocol: frontmatter parsing and validation.
 * Handles the YAML frontmatter block at the top of HANDOFF.md files.
 */

import type { HandoffFrontmatter, ProtocolValidationResult, ProtocolValidationError } from '../types/index.js';

// --- Frontmatter parsing ---

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Integer
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  // Quoted string (double or single quotes)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Plain string
  return trimmed;
}

/**
 * Parse YAML frontmatter block into a HandoffFrontmatter object.
 * Handles: top-level scalars, 2-space indented objects, 2-space indented arrays.
 * Returns null if no frontmatter is found or it cannot be parsed.
 */
export function parseFrontmatter(markdown: string): HandoffFrontmatter | null {
  if (!markdown.startsWith('---')) return null;

  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return null;

  const yamlBlock = markdown.slice(4, endIdx); // skip first '---\n'
  const lines = yamlBlock.split('\n');

  const result: Record<string, unknown> = {};

  // State: current top-level key and what it's accumulating
  let currentTopKey: string | null = null;
  type ChildMode = 'object' | 'array' | null;
  let childMode: ChildMode = null;
  let childObj: Record<string, unknown> | null = null;
  let childArr: unknown[] | null = null;

  function flushChild() {
    if (!currentTopKey) return;
    if (childMode === 'object' && childObj !== null) {
      result[currentTopKey] = childObj;
    } else if (childMode === 'array' && childArr !== null) {
      result[currentTopKey] = childArr;
    }
    currentTopKey = null;
    childMode = null;
    childObj = null;
    childArr = null;
  }

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Indented line (child of current top-level key)
    if (line.startsWith('  ') && !line.startsWith('    ')) {
      const content = line.slice(2);

      // Array item
      if (content.startsWith('- ')) {
        if (childMode === null) {
          childMode = 'array';
          childArr = [];
        }
        if (childMode === 'array') {
          childArr!.push(parseYamlValue(content.slice(2)));
        }
        continue;
      }

      // Object property: "  key: value"
      const colonIdx = content.indexOf(': ');
      if (colonIdx !== -1) {
        const nestedKey = content.slice(0, colonIdx).trim();
        const nestedVal = parseYamlValue(content.slice(colonIdx + 2));
        if (childMode === null || childMode === 'object') {
          childMode = 'object';
          if (!childObj) childObj = {};
          childObj[nestedKey] = nestedVal;
        }
        continue;
      }

      continue; // indented line with no parseable content
    }

    // Top-level line: flush any previous child accumulation first
    flushChild();

    // Top-level "key: value"
    const colonIdx = line.indexOf(': ');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const valueStr = line.slice(colonIdx + 2).trim();

      if (valueStr === '') {
        // Value on subsequent indented lines (object or array)
        currentTopKey = key;
        childMode = null;
        childObj = null;
        childArr = null;
      } else {
        result[key] = parseYamlValue(valueStr);
      }
    } else {
      // "key:" with trailing colon only
      const key = line.trim().replace(/:$/, '');
      currentTopKey = key;
      childMode = null;
      childObj = null;
      childArr = null;
    }
  }

  // Flush any remaining child accumulation
  flushChild();

  // Require at least some keys to consider this a valid frontmatter block
  // (not a random --- block in the document)
  if (Object.keys(result).length === 0) {
    return null;
  }

  return result as unknown as HandoffFrontmatter;
}

// --- Validation ---

function isValidIso8601(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes('T');
}

function isValidSemver(value: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(value);
}

/**
 * Validate a HANDOFF.md string against the protocol spec.
 * Returns a ValidationResult with all errors and warnings.
 */
export function validateHandoff(markdown: string): ProtocolValidationResult {
  const errors: ProtocolValidationError[] = [];

  // Check frontmatter exists
  if (!markdown.startsWith('---')) {
    errors.push({
      field: 'frontmatter',
      message: 'HANDOFF.md is missing YAML frontmatter (file must start with ---)',
      severity: 'error',
    });
    return { valid: false, errors };
  }

  const frontmatter = parseFrontmatter(markdown);
  if (!frontmatter) {
    errors.push({
      field: 'frontmatter',
      message: 'Could not parse YAML frontmatter -- block is empty or malformed',
      severity: 'error',
    });
    return { valid: false, errors };
  }

  // Use partial frontmatter for field-level validation (fields may be missing)

  // Required field checks
  if (!frontmatter.handoff_version) {
    errors.push({ field: 'handoff_version', message: 'Missing required field: handoff_version', severity: 'error' });
  } else if (!isValidSemver(frontmatter.handoff_version)) {
    errors.push({ field: 'handoff_version', message: `Invalid version format: "${frontmatter.handoff_version}" (expected semver like "2.0" or "2.0.0")`, severity: 'error' });
  }

  if (!frontmatter.session_id) {
    errors.push({ field: 'session_id', message: 'Missing required field: session_id', severity: 'error' });
  }

  if (!frontmatter.created_at) {
    errors.push({ field: 'created_at', message: 'Missing required field: created_at', severity: 'error' });
  } else if (!isValidIso8601(frontmatter.created_at)) {
    errors.push({ field: 'created_at', message: `Invalid ISO 8601 date: "${frontmatter.created_at}"`, severity: 'error' });
  }

  if (!frontmatter.working_dir) {
    errors.push({ field: 'working_dir', message: 'Missing required field: working_dir', severity: 'error' });
  }

  if (!frontmatter.changes) {
    errors.push({ field: 'changes', message: 'Missing required field: changes', severity: 'error' });
  } else {
    if (typeof frontmatter.changes.modified !== 'number' || frontmatter.changes.modified < 0) {
      errors.push({ field: 'changes.modified', message: 'changes.modified must be a non-negative integer', severity: 'error' });
    }
    if (typeof frontmatter.changes.added !== 'number' || frontmatter.changes.added < 0) {
      errors.push({ field: 'changes.added', message: 'changes.added must be a non-negative integer', severity: 'error' });
    }
    if (typeof frontmatter.changes.deleted !== 'number' || frontmatter.changes.deleted < 0) {
      errors.push({ field: 'changes.deleted', message: 'changes.deleted must be a non-negative integer', severity: 'error' });
    }
  }

  // Warning: stale handoff (duration check)
  if (frontmatter.created_at && isValidIso8601(frontmatter.created_at)) {
    const ageHours = (Date.now() - new Date(frontmatter.created_at).getTime()) / (1000 * 60 * 60);
    if (ageHours > 48) {
      errors.push({
        field: 'created_at',
        message: `Handoff is ${Math.floor(ageHours)}h old -- context may be stale`,
        severity: 'warning',
      });
    }
  }

  // Warning: no changes
  if (frontmatter.changes) {
    const total = (frontmatter.changes.modified ?? 0) + (frontmatter.changes.added ?? 0) + (frontmatter.changes.deleted ?? 0);
    if (total === 0) {
      errors.push({
        field: 'changes',
        message: 'No file changes recorded -- this handoff may have been exported before any work was done',
        severity: 'warning',
      });
    }
  }

  // Compression validation (if present)
  if (frontmatter.compression) {
    if (frontmatter.compression.token_budget <= 0) {
      errors.push({ field: 'compression.token_budget', message: 'compression.token_budget must be positive', severity: 'error' });
    }
    if (frontmatter.compression.tokens_used > frontmatter.compression.token_budget) {
      errors.push({ field: 'compression.tokens_used', message: 'tokens_used exceeds token_budget', severity: 'warning' });
    }
  }

  const hasErrors = errors.some((e) => e.severity === 'error');
  return { valid: !hasErrors, errors };
}

/**
 * Extract the markdown body (after frontmatter).
 */
export function getMarkdownBody(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;

  const endIdx = markdown.indexOf('\n---', 3);
  if (endIdx === -1) return markdown;

  return markdown.slice(endIdx + 4).trimStart();
}
