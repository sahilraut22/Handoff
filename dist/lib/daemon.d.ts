import type { WatcherState } from '../types/index.js';
export interface DaemonStartConfig {
    working_dir: string;
    pid_file?: string;
    log_file?: string;
    detach?: boolean;
    debounce_ms?: number;
    change_threshold?: number;
    max_regen_interval_ms?: number;
}
export declare function startDaemon(config: DaemonStartConfig): Promise<number>;
export declare function stopDaemon(workingDir: string, pidFile?: string): Promise<void>;
export declare function isDaemonRunning(workingDir: string, pidFile?: string): Promise<boolean>;
export declare function getDaemonStatus(workingDir: string): Promise<WatcherState | null>;
/**
 * Write the PID file for the current process (called from within the daemon entry).
 */
export declare function writePidFile(pidPath: string): Promise<void>;
/**
 * Remove PID file (called on daemon shutdown).
 */
export declare function removePidFile(pidPath: string): Promise<void>;
/**
 * Check if the daemon entry point file exists.
 */
export declare function daemonEntryExists(entryPath: string): Promise<boolean>;
