/**
 * Regex-based semantic analysis of source files.
 * Extracts named entities (functions, classes, interfaces, etc.) and produces
 * human-readable summaries of what changed between two versions of a file.
 * No native dependencies -- pure regex, handles the common 80% of cases.
 */
export type EntityType = 'function' | 'class' | 'interface' | 'type' | 'export' | 'variable' | 'method' | 'struct' | 'trait' | 'contract' | 'event' | 'modifier';
export interface SemanticEntity {
    name: string;
    type: EntityType;
    line: number;
}
export interface SemanticDiff {
    added: SemanticEntity[];
    removed: SemanticEntity[];
    modified: Array<{
        entity: SemanticEntity;
        summary: string;
    }>;
}
export declare function detectLanguage(filePath: string): string;
export declare function extractEntities(content: string, language: string): SemanticEntity[];
export declare function computeSemanticDiff(oldContent: string, newContent: string, filePath: string): SemanticDiff;
export declare function formatSemanticSummary(diff: SemanticDiff): string;
/**
 * Extract names of changed functions/classes from a unified diff string.
 * Looks for function/class declarations near changed lines (+/-).
 */
export declare function extractChangedNames(diff: string, filePath: string): string[];
