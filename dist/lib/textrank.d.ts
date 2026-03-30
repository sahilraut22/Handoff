/**
 * TextRank extractive summarization.
 * Selects the most important sentences from text using a PageRank-style
 * algorithm over a sentence similarity graph.
 */
export interface TextRankConfig {
    damping: number;
    convergence_threshold: number;
    max_iterations: number;
    summary_ratio: number;
}
export interface RankedSentence {
    text: string;
    score: number;
    index: number;
}
/**
 * Build a symmetric similarity matrix for all sentence pairs.
 */
export declare function buildSimilarityGraph(sentences: string[]): number[][];
/**
 * Split text into sentences, respecting code boundaries.
 */
export declare function splitSentences(text: string): string[];
/**
 * Run TextRank on sentences, return ranked results.
 */
export declare function textRank(sentences: string[], config?: Partial<TextRankConfig>): RankedSentence[];
/**
 * Produce an extractive summary: top sentences in original order.
 */
export declare function summarize(text: string, config?: Partial<TextRankConfig>): string;
/**
 * Summarize a unified diff by extracting the most important changed lines.
 * Preserves hunk headers (@@ lines) and selects most important +/- lines.
 */
export declare function summarizeDiff(diff: string, maxSentences?: number): string;
