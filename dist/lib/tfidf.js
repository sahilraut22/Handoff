/**
 * TF-IDF vector computation and cosine similarity for ranking text relevance.
 * Used to score file changes against a query and rank decisions by similarity.
 */
import { STOP_WORDS } from './compress.js';
/**
 * Tokenize text for TF-IDF: lowercase, split on non-word chars,
 * filter stop words, split camelCase and snake_case.
 */
export function tokenize(text) {
    // Split camelCase and snake_case identifiers
    const normalized = text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/[_]/g, ' ');
    return normalized
        .toLowerCase()
        .split(/[^\w]+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}
/**
 * Compute term frequency map for a document.
 * TF = count(t in d) / |d|
 */
function termFrequency(tokens) {
    const counts = new Map();
    for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    const total = tokens.length || 1;
    const tf = new Map();
    for (const [term, count] of counts) {
        tf.set(term, count / total);
    }
    return tf;
}
/**
 * Build a TF-IDF corpus from a collection of documents.
 */
export function buildCorpus(documents) {
    const N = documents.length;
    const df = new Map();
    for (const doc of documents) {
        const unique = new Set(tokenize(doc));
        for (const term of unique) {
            df.set(term, (df.get(term) ?? 0) + 1);
        }
    }
    return { documents, df, N };
}
/**
 * Compute TF-IDF vector for a document against a corpus.
 * IDF = log(N / (1 + df(t)))  (smoothed to avoid division by zero)
 */
export function computeTfIdf(document, corpus) {
    const tokens = tokenize(document);
    const tf = termFrequency(tokens);
    const terms = new Map();
    for (const [term, tfVal] of tf) {
        const docFreq = corpus.df.get(term) ?? 0;
        const idf = Math.log((corpus.N + 1) / (1 + docFreq));
        terms.set(term, tfVal * idf);
    }
    // Compute L2 magnitude for cosine similarity
    let sumSq = 0;
    for (const val of terms.values()) {
        sumSq += val * val;
    }
    const magnitude = Math.sqrt(sumSq) || 1;
    return { terms, magnitude };
}
/**
 * Cosine similarity between two TF-IDF vectors.
 * Returns 0.0 - 1.0.
 */
export function cosineSimilarity(a, b) {
    let dotProduct = 0;
    // Iterate over smaller vector for efficiency
    const [small, large] = a.terms.size <= b.terms.size ? [a, b] : [b, a];
    for (const [term, weightA] of small.terms) {
        const weightB = large.terms.get(term);
        if (weightB !== undefined) {
            dotProduct += weightA * weightB;
        }
    }
    return dotProduct / (a.magnitude * b.magnitude);
}
/**
 * Rank documents by relevance to a query using TF-IDF cosine similarity.
 * Returns results sorted by score descending.
 */
export function rankByRelevance(query, documents, labels) {
    if (documents.length === 0)
        return [];
    const corpus = buildCorpus([query, ...documents]);
    const queryVec = computeTfIdf(query, corpus);
    return documents
        .map((doc, i) => {
        const docVec = computeTfIdf(doc, corpus);
        const score = cosineSimilarity(queryVec, docVec);
        return {
            label: labels?.[i] ?? String(i),
            score,
            index: i,
        };
    })
        .sort((a, b) => b.score - a.score);
}
/**
 * Score a single document's relevance to a query (0.0 - 1.0).
 * Builds a minimal corpus from just the query and document.
 */
export function scoreRelevance(query, document, existingCorpus) {
    if (!query.trim() || !document.trim())
        return 0;
    const corpus = existingCorpus ?? buildCorpus([query, document]);
    const queryVec = computeTfIdf(query, corpus);
    const docVec = computeTfIdf(document, corpus);
    return cosineSimilarity(queryVec, docVec);
}
//# sourceMappingURL=tfidf.js.map