import type { FileChange, HandoffConfig } from '../types/index.js';
export declare function walkFiles(dir: string, excludePatterns: string[]): Promise<string[]>;
export declare function hashFile(filePath: string): Promise<string>;
export declare function hashAllFiles(dir: string, files: string[], concurrency?: number): Promise<Record<string, string>>;
export declare function isBinaryFile(filePath: string): Promise<boolean>;
export declare function snapshotFile(srcPath: string, snapshotDir: string, relativePath: string): Promise<void>;
export declare function snapshotAllFiles(dir: string, files: string[], snapshotDir: string, concurrency?: number): Promise<void>;
export declare function generateDiff(oldContent: string, newContent: string, filePath: string, contextLines: number): string;
declare function countDiffLines(diff: string): {
    added: number;
    removed: number;
};
declare function truncateDiff(diff: string, maxLines: number): {
    truncated: string;
    totalLines: number;
    wasTruncated: boolean;
};
export declare function computeChanges(dir: string, snapshotDir: string, oldHashes: Record<string, string>, newHashes: Record<string, string>, config: HandoffConfig): Promise<FileChange[]>;
export { truncateDiff, countDiffLines };
