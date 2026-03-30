/**
 * Shared context file management for cross-platform IPC.
 * Manages the HANDOFF.md file in .handoff/ipc/context/ and notifies agents.
 */
import type { ContextFile } from '../types/index.js';
/**
 * Publish updated context and notify all present agents.
 */
export declare function publishContext(ipcDir: string, handoffContent: string, updatedBy: string, sessionId?: string): Promise<void>;
/**
 * Check if context has been updated since agent's last read.
 */
export declare function hasNewContext(ipcDir: string, agent: string, lastReadHash?: string): Promise<boolean>;
/**
 * Read the latest context file and metadata.
 */
export declare function readContext(ipcDir: string): Promise<{
    content: string;
    meta: ContextFile;
} | null>;
/**
 * Mark agent as having read the latest context.
 * Sends an acknowledgement message back to the publisher.
 */
export declare function acknowledgeContext(ipcDir: string, agent: string): Promise<void>;
