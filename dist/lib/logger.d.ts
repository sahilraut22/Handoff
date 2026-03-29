import type { QueryLogEntry } from '../types/index.js';
export declare function appendQueryLog(workingDir: string, entry: QueryLogEntry): Promise<void>;
export declare function readQueryLog(workingDir: string): Promise<QueryLogEntry[]>;
