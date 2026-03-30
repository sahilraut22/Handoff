/**
 * TF-IDF vector computation and cosine similarity for ranking text relevance.
 * Used to score file changes against a query and rank decisions by similarity.
 */
export interface TfIdfVector {
    terms: Map<string, number>;
    magnitude: number;
}
export interface TfIdfCorpus {
    documents: string[];
    df: Map<string, number>;
    N: number;
}
/**
 * Tokenize text for TF-IDF: lowercase, split on non-word chars,
 * filter stop words, split camelCase and snake_case.
 */
export declare function tokenize(text: string): string[];
/**
 * Build a TF-IDF corpus from a collection of documents.
 */
export declare function buildCorpus(documents: string[]): TfIdfCorpus;
/**
 * Compute TF-IDF vector for a document against a corpus.
 * IDF = log(N / (1 + df(t)))  (smoothed to avoid division by zero)
 */
export declare function computeTfIdf(document: string, corpus: TfIdfCorpus): TfIdfVector;
/**
 * Cosine similarity between two TF-IDF vectors.
 * Returns 0.0 - 1.0.
 */
export declare function cosineSimilarity(a: TfIdfVector, b: TfIdfVector): number;
/**
 * Rank documents by relevance to a query using TF-IDF cosine similarity.
 * Returns results sorted by score descending.
 */
export declare function rankByRelevance(query: string, documents: string[], labels?: string[]): Array<{
    label: string;
    score: number;
    index: number;
}>;
/**
 * Score a single document's relevance to a query (0.0 - 1.0).
 * Builds a minimal corpus from just the query and document.
 */
export declare function scoreRelevance(query: string, document: string, existingCorpus?: TfIdfCorpus): number;
