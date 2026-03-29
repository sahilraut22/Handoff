/**
 * Priority-based compression engine for HANDOFF.md context.
 *
 * v2.1 improvements:
 * - Content-aware priority boosting (keywords in diff override path classification)
 * - Word-based token estimation via tokens.ts
 * - Query-adaptive relevance scoring (--for <query>)
 * - Reference-coherent diff compression (preserve lines referencing critical identifiers)
 */
import type { FileChange, ChangePriority, CompressionOptions, CompressionResult } from '../types/index.js';
export declare function classifyPriority(change: FileChange): ChangePriority;
export declare function extractQueryKeywords(query: string): string[];
export declare function scoreQueryRelevance(change: FileChange, keywords: string[]): number;
export declare function adjustPriorityForQuery(change: FileChange & {
    priority: ChangePriority;
}, keywords: string[]): ChangePriority;
export declare function extractIdentifiers(diff: string): Set<string>;
export declare function compressDiffCoherent(diff: string, maxLines: number, criticalIdentifiers: Set<string>): string;
export declare function compressDiff(diff: string, targetLines: number): string;
export declare function compressChanges(changes: FileChange[], options?: CompressionOptions): CompressionResult;
