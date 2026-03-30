/**
 * TextRank extractive summarization.
 * Selects the most important sentences from text using a PageRank-style
 * algorithm over a sentence similarity graph.
 */

import { STOP_WORDS } from './compress.js';

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

const DEFAULT_CONFIG: TextRankConfig = {
  damping: 0.85,
  convergence_threshold: 0.0001,
  max_iterations: 100,
  summary_ratio: 0.3,
};

/**
 * Tokenize text into individual words for similarity computation.
 * Filters stop words and normalizes.
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Compute word-overlap similarity between two sentences.
 * Uses the TextRank formula: |S1 ∩ S2| / (log|S1| + log|S2|)
 */
function sentenceSimilarity(a: string, b: string): number {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  if (intersection === 0) return 0;

  const denominator = Math.log(wordsA.size + 1) + Math.log(wordsB.size + 1);
  return denominator > 0 ? intersection / denominator : 0;
}

/**
 * Build a symmetric similarity matrix for all sentence pairs.
 */
export function buildSimilarityGraph(sentences: string[]): number[][] {
  const n = sentences.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = sentenceSimilarity(sentences[i]!, sentences[j]!);
      matrix[i]![j] = sim;
      matrix[j]![i] = sim;
    }
  }
  return matrix;
}

/**
 * Run PageRank-style iteration on the similarity graph.
 * Returns scores for each sentence.
 */
function runPageRank(graph: number[][], config: TextRankConfig): number[] {
  const n = graph.length;
  if (n === 0) return [];
  if (n === 1) return [1.0];

  // Initialize scores uniformly
  let scores = new Array(n).fill(1.0 / n);

  for (let iter = 0; iter < config.max_iterations; iter++) {
    const newScores = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const rowSum = graph[j]!.reduce((a, b) => a + b, 0);
        if (rowSum > 0) {
          sum += (graph[j]![i]! / rowSum) * scores[j]!;
        }
      }
      newScores[i] = (1 - config.damping) + config.damping * sum;
    }

    // Check convergence
    const delta = scores.reduce((acc, s, i) => acc + Math.abs(newScores[i]! - s), 0);
    scores = newScores;

    if (delta < config.convergence_threshold) break;
  }

  return scores;
}

/**
 * Split text into sentences, respecting code boundaries.
 */
export function splitSentences(text: string): string[] {
  // Split on sentence-ending patterns but preserve code blocks
  const sentences: string[] = [];

  // First split on double newlines (paragraph breaks)
  const paragraphs = text.split(/\n{2,}/);

  for (const para of paragraphs) {
    if (!para.trim()) continue;

    // For single-line or short content, treat the whole paragraph as one sentence
    const lines = para.split('\n');
    if (lines.length <= 2 || para.length < 100) {
      const clean = para.trim();
      if (clean) sentences.push(clean);
      continue;
    }

    // For longer paragraphs, split on '. ' patterns (but not '...' or '. js')
    const parts = para.split(/(?<!\.)\.(?!\.)(?!\w)\s+/);
    for (const part of parts) {
      const clean = part.trim();
      if (clean.length >= 10) sentences.push(clean);
    }
  }

  // Also include individual significant lines (function declarations, etc.)
  const significantLinePattern = /^(?:\+|-|\s)*(?:function|class|interface|export|const|let|var|def|async)\s+\w+/;
  for (const line of text.split('\n')) {
    if (significantLinePattern.test(line) && line.trim().length >= 20) {
      if (!sentences.some((s) => s.includes(line.trim()))) {
        sentences.push(line.trim());
      }
    }
  }

  return sentences.filter((s) => s.length >= 10);
}

/**
 * Run TextRank on sentences, return ranked results.
 */
export function textRank(
  sentences: string[],
  config?: Partial<TextRankConfig>
): RankedSentence[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    return [{ text: sentences[0]!, score: 1.0, index: 0 }];
  }

  const graph = buildSimilarityGraph(sentences);
  const scores = runPageRank(graph, cfg);

  return sentences.map((text, index) => ({
    text,
    score: scores[index] ?? 0,
    index,
  }));
}

/**
 * Produce an extractive summary: top sentences in original order.
 */
export function summarize(text: string, config?: Partial<TextRankConfig>): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sentences = splitSentences(text);

  if (sentences.length === 0) return text;
  if (sentences.length <= 2) return text;

  const ranked = textRank(sentences, cfg);
  const keepCount = Math.max(1, Math.ceil(sentences.length * cfg.summary_ratio));

  // Select top-ranked sentences
  const topIndices = new Set(
    [...ranked]
      .sort((a, b) => b.score - a.score)
      .slice(0, keepCount)
      .map((r) => r.index)
  );

  // Return in original order
  return ranked
    .filter((r) => topIndices.has(r.index))
    .sort((a, b) => a.index - b.index)
    .map((r) => r.text)
    .join('\n');
}

/**
 * Summarize a unified diff by extracting the most important changed lines.
 * Preserves hunk headers (@@ lines) and selects most important +/- lines.
 */
export function summarizeDiff(diff: string, maxSentences = 20): string {
  if (!diff.trim()) return diff;

  const lines = diff.split('\n');
  const headerLines: string[] = [];
  const changedLines: string[] = [];
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      headerLines.push(line);
      result.push(line);
    } else if (line.startsWith('+') || line.startsWith('-')) {
      changedLines.push(line);
    }
  }

  if (changedLines.length <= maxSentences) return diff;

  // Run TextRank on changed lines
  const ranked = textRank(changedLines, { summary_ratio: maxSentences / changedLines.length });
  const keepCount = Math.min(maxSentences, ranked.length);

  const topIndices = new Set(
    [...ranked]
      .sort((a, b) => b.score - a.score)
      .slice(0, keepCount)
      .map((r) => r.index)
  );

  const selectedChanges = ranked
    .filter((r) => topIndices.has(r.index))
    .sort((a, b) => a.index - b.index)
    .map((r) => r.text);

  return [...result, ...selectedChanges].join('\n');
}
