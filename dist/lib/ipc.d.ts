/**
 * File-based IPC engine for cross-platform agent-to-agent messaging.
 * Works without tmux on Windows, macOS, and Linux.
 *
 * Directory structure:
 *   .handoff/ipc/
 *     agents/{agent}/
 *       presence.json
 *       inbox/
 *         msg-{timestamp}-{id}.json
 *     context/
 *       HANDOFF.md
 *       meta.json
 */
import type { IpcMessage, IpcConfig, AgentPresence } from '../types/index.js';
declare const DEFAULT_IPC_CONFIG: IpcConfig;
/**
 * Initialize IPC directory structure.
 */
export declare function initIpc(ipcDir: string): Promise<void>;
/**
 * Send a message to an agent's inbox using atomic write.
 */
export declare function sendMessage(ipcDir: string, message: IpcMessage): Promise<void>;
/**
 * Read messages from an agent's inbox.
 */
export declare function readInbox(ipcDir: string, agent: string, options?: {
    unreadOnly?: boolean;
    deleteAfterRead?: boolean;
}): Promise<IpcMessage[]>;
/**
 * Update agent heartbeat / presence file.
 */
export declare function updatePresence(ipcDir: string, agent: string, status?: 'active' | 'idle'): Promise<void>;
/**
 * Get all known agent presences from the ipc directory.
 */
export declare function getPresences(ipcDir: string): Promise<AgentPresence[]>;
/**
 * Check if an agent is alive based on its last heartbeat.
 */
export declare function isAgentAlive(presence: AgentPresence, timeoutMs?: number): boolean;
/**
 * Clean up expired messages and stale presence files.
 */
export declare function cleanupIpc(ipcDir: string, config?: Partial<IpcConfig>): Promise<void>;
export { DEFAULT_IPC_CONFIG };
