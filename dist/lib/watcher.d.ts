import type { WatcherConfig, WatcherState } from '../types/index.js';
export type { WatcherConfig, WatcherState };
export interface WatcherEvents {
    onFileChange: (path: string, type: 'add' | 'change' | 'unlink') => void;
    onRegenerate: (changedPaths: string[]) => void;
    onError: (error: Error) => void;
}
export interface WatcherHandle {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getState: () => WatcherState;
}
export declare function createWatcher(config: WatcherConfig, events: WatcherEvents): WatcherHandle;
export declare function loadWatcherState(workingDir: string): Promise<WatcherState | null>;
