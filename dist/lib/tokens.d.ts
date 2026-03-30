/**
 * Accurate BPE token counting using gpt-tokenizer (cl100k_base vocabulary).
 * Used by GPT-4 and Claude models.
 *
 * Falls back to heuristic estimation if tokenizer is unavailable.
 *
 * Exports:
 * - countTokens(text): accurate BPE count
 * - estimateTokens(text): alias for backward compatibility
 * - truncateToTokens(text, maxTokens): cut at exact token boundary
 * - countTokensBatch(texts): count multiple texts
 */
/**
 * Count tokens accurately using BPE (cl100k_base vocabulary).
 */
export declare function countTokens(text: string): number;
/**
 * Backward-compatible alias for countTokens().
 * All existing callers (compress.ts, benchmark.ts, etc.) use this name.
 */
export declare function estimateTokens(text: string): number;
/**
 * Truncate text to fit within maxTokens using accurate BPE encoding.
 * Returns the longest prefix that fits, decoded back to a string.
 */
export declare function truncateToTokens(text: string, maxTokens: number): string;
/**
 * Count tokens for multiple texts efficiently.
 */
export declare function countTokensBatch(texts: string[]): number[];
