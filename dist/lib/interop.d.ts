/**
 * Interoperability layer: generate output in formats compatible with
 * other agent memory files (CLAUDE.md, AGENTS.md) or structured JSON.
 */
import type { HandoffContext } from '../types/index.js';
export type InteropFormat = 'json' | 'claude' | 'agents';
/**
 * Detect which agent memory files exist in a directory.
 */
export declare function detectMemoryFiles(dir: string): Promise<Array<{
    agent: string;
    file: string;
    path: string;
}>>;
/**
 * Read and merge context from multiple agent memory files.
 */
export declare function loadAgentMemory(dir: string, files: string[]): Promise<Record<string, string>>;
/**
 * Generate a CLAUDE.md compatible snippet from handoff context.
 * This can be prepended to an existing CLAUDE.md.
 */
export declare function generateClaudeMdSnippet(context: HandoffContext): string;
/**
 * Generate an AGENTS.md compatible section from handoff context.
 */
export declare function generateAgentsMdSection(context: HandoffContext): string;
/**
 * Generate structured JSON output from handoff context.
 */
export declare function generateJsonOutput(context: HandoffContext): string;
/**
 * Main dispatch for interop output formats.
 */
export declare function generateInteropOutput(context: HandoffContext, format: InteropFormat): string;
