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
export function estimateTokens(text) {
    if (!text)
        return 0;
    let tokens = 0;
    // Split into alternating word and non-word chunks
    const chunks = text.split(/(\s+|[^\w\s]+)/);
    for (const chunk of chunks) {
        if (!chunk)
            continue;
        // Whitespace
        if (/^\s+$/.test(chunk)) {
            tokens += 0.25 * chunk.length;
            continue;
        }
        // Pure punctuation / special characters
        if (/^[^\w\s]+$/.test(chunk)) {
            tokens += chunk.length * 0.7;
            continue;
        }
        // Pure numbers
        if (/^\d+$/.test(chunk)) {
            tokens += Math.ceil(chunk.length / 2.5);
            continue;
        }
        // Word / identifier — split at camelCase and snake_case boundaries
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