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
import { encode, decode } from 'gpt-tokenizer';
/**
 * Count tokens accurately using BPE (cl100k_base vocabulary).
 */
export function countTokens(text) {
    if (!text)
        return 0;
    try {
        return encode(text).length;
    }
    catch {
        // Fallback to heuristic if tokenizer fails
        return estimateTokensHeuristic(text);
    }
}
/**
 * Backward-compatible alias for countTokens().
 * All existing callers (compress.ts, benchmark.ts, etc.) use this name.
 */
export function estimateTokens(text) {
    return countTokens(text);
}
/**
 * Truncate text to fit within maxTokens using accurate BPE encoding.
 * Returns the longest prefix that fits, decoded back to a string.
 */
export function truncateToTokens(text, maxTokens) {
    if (!text)
        return '';
    try {
        const tokens = encode(text);
        if (tokens.length <= maxTokens)
            return text;
        const truncatedTokens = tokens.slice(0, maxTokens);
        return decode(truncatedTokens);
    }
    catch {
        // Fallback: character-based truncation (~4 chars per token)
        const approxChars = maxTokens * 4;
        return text.slice(0, approxChars);
    }
}
/**
 * Count tokens for multiple texts efficiently.
 */
export function countTokensBatch(texts) {
    return texts.map(countTokens);
}
/**
 * Heuristic fallback (original implementation) used when BPE encoding fails.
 * Approximates BPE tokenization via word-length bucketing.
 */
function estimateTokensHeuristic(text) {
    if (!text)
        return 0;
    let tokens = 0;
    const chunks = text.split(/(\s+|[^\w\s]+)/);
    for (const chunk of chunks) {
        if (!chunk)
            continue;
        if (/^\s+$/.test(chunk)) {
            tokens += 0.25 * chunk.length;
            continue;
        }
        if (/^[^\w\s]+$/.test(chunk)) {
            tokens += chunk.length * 0.7;
            continue;
        }
        if (/^\d+$/.test(chunk)) {
            tokens += Math.ceil(chunk.length / 2.5);
            continue;
        }
        const subwords = chunk
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        for (const sw of subwords) {
            const len = sw.length;
            if (len <= 4) {
                tokens += 1;
            }
            else if (len <= 8) {
                tokens += 1.3;
            }
            else if (len <= 12) {
                tokens += 2;
            }
            else {
                tokens += Math.ceil(len / 4);
            }
        }
    }
    return Math.ceil(tokens);
}
//# sourceMappingURL=tokens.js.map