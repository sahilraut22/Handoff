import type { QueryLogEntry } from '../types/index.js';
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
declare class Logger {
    private level;
    private jsonMode;
    constructor();
    setLevel(level: LogLevel): void;
    setJsonMode(enabled: boolean): void;
    private shouldLog;
    private emit;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
    /**
     * Start a timer. Returns a function that, when called, logs the elapsed time.
     */
    time(label: string): () => void;
}
export declare const logger: Logger;
export declare function appendQueryLog(workingDir: string, entry: QueryLogEntry): Promise<void>;
export declare function readQueryLog(workingDir: string): Promise<QueryLogEntry[]>;
export {};
