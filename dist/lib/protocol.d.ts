/**
 * HANDOFF.md protocol: frontmatter parsing and validation.
 * Handles the YAML frontmatter block at the top of HANDOFF.md files.
 */
import type { HandoffFrontmatter, ProtocolValidationResult } from '../types/index.js';
/**
 * Parse YAML frontmatter block into a HandoffFrontmatter object.
 * Handles: top-level scalars, 2-space indented objects, 2-space indented arrays.
 * Returns null if no frontmatter is found or it cannot be parsed.
 */
export declare function parseFrontmatter(markdown: string): HandoffFrontmatter | null;
/**
 * Validate a HANDOFF.md string against the protocol spec.
 * Returns a ValidationResult with all errors and warnings.
 */
export declare function validateHandoff(markdown: string): ProtocolValidationResult;
/**
 * Extract the markdown body (after frontmatter).
 */
export declare function getMarkdownBody(markdown: string): string;
