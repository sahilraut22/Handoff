/**
 * Priority-based compression engine for HANDOFF.md context.
 * Classifies changes by importance, compresses diffs to fit within a token budget,
 * and enriches changes with semantic summaries.
 */
import type { FileChange, ChangePriority, CompressionOptions, CompressionResult } from '../types/index.js';
export declare function classifyPriority(change: FileChange): ChangePriority;
export declare function estimateTokens(text: string): number;
/**
 * Smart diff compression: preserves hunk headers and key lines per hunk,
 * elides unimportant middle lines.
 */
export declare function compressDiff(diff: string, targetLines: number): string;
export declare function compressChanges(changes: FileChange[], options?: CompressionOptions): CompressionResult;
