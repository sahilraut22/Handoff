import type { DecisionPattern, ExtractionConfig, ExtractedDecision } from '../types/index.js';
declare const DEFAULT_PATTERNS: DecisionPattern[];
declare const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig;
export declare function extractDecisions(text: string, source: 'diff' | 'conversation' | 'commit', config?: Partial<ExtractionConfig>): ExtractedDecision[];
export declare function mergeExtracted(existingTitles: string[], extracted: ExtractedDecision[]): {
    new_decisions: ExtractedDecision[];
    duplicates: number;
};
export declare function formatExtractedForReview(decisions: ExtractedDecision[]): string;
export { DEFAULT_PATTERNS, DEFAULT_EXTRACTION_CONFIG };
