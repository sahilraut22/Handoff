/**
 * Word-based token estimation without external dependencies.
 * Approximates BPE tokenization used by GPT/Claude models.
 *
 * Heuristics:
 * - Short words (≤4 chars) → ~1 token
 * - Medium words (5-8 chars) → ~1.3 tokens
 * - Long words (9-12 chars) → ~2 tokens
 * - Very long words (13+) → chars/4 tokens
 * - CamelCase / snake_case identifiers → split at boundaries before estimating
 * - Punctuation and special chars → ~0.7 tokens each
 * - Numbers → ~1 token per 2-3 digits
 * - Whitespace → ~0.25 tokens per char (usually merged with adjacent tokens)
 */
export declare function estimateTokens(text: string): number;
