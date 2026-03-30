/**
 * Semantic chunking: splits diffs and source code into function-level chunks
 * rather than arbitrary line counts.
 *
 * Uses entity ranges from semantic.ts to identify boundaries, then selects
 * chunks within a token budget using importance scoring from tfidf.ts.
 */
import { scoreRelevance } from './tfidf.js';
export interface SemanticChunk {
    content: string;
    type: 'function' | 'class' | 'interface' | 'block' | 'import' | 'other';
    name?: string;
    start_line: number;
    end_line: number;
    token_count: number;
    importance: number;
}
/**
 * Split source code into semantic chunks based on entity boundaries.
 */
export declare function chunkCode(content: string, language: string): SemanticChunk[];
/**
 * Split a unified diff into semantic chunks (per-entity diffs).
 * Groups consecutive hunks that modify the same entity together.
 */
export declare function chunkDiff(diff: string, filePath: string): SemanticChunk[];
/**
 * Score chunks by relevance to a query using TF-IDF.
 */
export declare function scoreChunks(chunks: SemanticChunk[], query: string): SemanticChunk[];
/**
 * Select chunks within a token budget, prioritized by importance.
 * Uses a greedy approach -- always includes the most important chunks first.
 */
export declare function selectChunks(chunks: SemanticChunk[], tokenBudget: number): SemanticChunk[];
/**
 * Reassemble selected chunks into a coherent output string.
 * Inserts omission markers for gaps.
 */
export declare function assembleChunks(chunks: SemanticChunk[], totalLines: number): string;
export { scoreRelevance };
