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
import { readFile, writeFile, mkdir, readdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from './logger.js';
const DEFAULT_IPC_CONFIG = {
    ipc_dir: '.handoff/ipc',
    heartbeat_interval_ms: 10000,
    heartbeat_timeout_ms: 30000,
    message_ttl_ms: 300000,
    max_inbox_size: 100,
    cleanup_interval_ms: 60000,
};
function generateMessageId() {
    return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}
function agentDir(ipcDir, agent) {
    return join(ipcDir, 'agents', agent);
}
function inboxDir(ipcDir, agent) {
    return join(agentDir(ipcDir, agent), 'inbox');
}
function presencePath(ipcDir, agent) {
    return join(agentDir(ipcDir, agent), 'presence.json');
}
function messagePath(ipcDir, agent, messageId) {
    return join(inboxDir(ipcDir, agent), `msg-${messageId}.json`);
}
/**
 * Initialize IPC directory structure.
 */
export async function initIpc(ipcDir) {
    await mkdir(join(ipcDir, 'agents'), { recursive: true });
    await mkdir(join(ipcDir, 'context'), { recursive: true });
}
/**
 * Send a message to an agent's inbox using atomic write.
 */
export async function sendMessage(ipcDir, message) {
    const dir = inboxDir(ipcDir, message.to);
    await mkdir(dir, { recursive: true });
    const id = message.id || generateMessageId();
    const msg = { ...message, id };
    const targetPath = messagePath(ipcDir, message.to, id);
    const tmpPath = targetPath + '.tmp';
    // Atomic write: write to .tmp then rename
    await writeFile(tmpPath, JSON.stringify(msg, null, 2), 'utf-8');
    await rename(tmpPath, targetPath);
    logger.debug('Message sent', { from: message.from, to: message.to, type: message.type });
}
/**
 * Read messages from an agent's inbox.
 */
export async function readInbox(ipcDir, agent, options = {}) {
    const dir = inboxDir(ipcDir, agent);
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch {
        return [];
    }
    const msgFiles = entries
        .filter((e) => e.startsWith('msg-') && e.endsWith('.json'))
        .sort(); // Oldest first (timestamp prefix ensures order)
    const messages = [];
    const now = Date.now();
    for (const file of msgFiles) {
        const filePath = join(dir, file);
        try {
            const content = await readFile(filePath, 'utf-8');
            const msg = JSON.parse(content);
            // Check TTL
            const msgTime = new Date(msg.timestamp).getTime();
            const ttl = msg.ttl_ms ?? DEFAULT_IPC_CONFIG.message_ttl_ms;
            if (now - msgTime > ttl) {
                await unlink(filePath).catch(() => undefined);
                continue;
            }
            messages.push(msg);
            if (options.deleteAfterRead) {
                await unlink(filePath).catch(() => undefined);
            }
        }
        catch {
            // Skip malformed message files
        }
    }
    return messages;
}
/**
 * Update agent heartbeat / presence file.
 */
export async function updatePresence(ipcDir, agent, status = 'active') {
    const dir = agentDir(ipcDir, agent);
    await mkdir(dir, { recursive: true });
    const presence = {
        agent,
        status,
        last_heartbeat: new Date().toISOString(),
        pid: process.pid,
    };
    const path = presencePath(ipcDir, agent);
    const tmp = path + '.tmp';
    await writeFile(tmp, JSON.stringify(presence, null, 2), 'utf-8');
    await rename(tmp, path);
}
/**
 * Get all known agent presences from the ipc directory.
 */
export async function getPresences(ipcDir) {
    const agentsRoot = join(ipcDir, 'agents');
    let agentDirs;
    try {
        agentDirs = await readdir(agentsRoot);
    }
    catch {
        return [];
    }
    const presences = [];
    for (const agentName of agentDirs) {
        try {
            const content = await readFile(presencePath(ipcDir, agentName), 'utf-8');
            const presence = JSON.parse(content);
            presences.push(presence);
        }
        catch {
            // No presence file for this agent
        }
    }
    return presences;
}
/**
 * Check if an agent is alive based on its last heartbeat.
 */
export function isAgentAlive(presence, timeoutMs) {
    const timeout = timeoutMs ?? DEFAULT_IPC_CONFIG.heartbeat_timeout_ms;
    const lastBeat = new Date(presence.last_heartbeat).getTime();
    return Date.now() - lastBeat < timeout;
}
/**
 * Clean up expired messages and stale presence files.
 */
export async function cleanupIpc(ipcDir, config) {
    const cfg = { ...DEFAULT_IPC_CONFIG, ...config };
    const agentsRoot = join(ipcDir, 'agents');
    let agentDirs;
    try {
        agentDirs = await readdir(agentsRoot);
    }
    catch {
        return;
    }
    const now = Date.now();
    for (const agentName of agentDirs) {
        // Clean expired messages
        const inbox = inboxDir(ipcDir, agentName);
        let msgFiles = [];
        try {
            msgFiles = await readdir(inbox);
        }
        catch {
            continue;
        }
        for (const file of msgFiles.filter((f) => f.endsWith('.json'))) {
            try {
                const content = await readFile(join(inbox, file), 'utf-8');
                const msg = JSON.parse(content);
                const msgTime = new Date(msg.timestamp).getTime();
                if (now - msgTime > (msg.ttl_ms ?? cfg.message_ttl_ms)) {
                    await unlink(join(inbox, file)).catch(() => undefined);
                }
            }
            catch {
                // Remove unreadable files
                await unlink(join(inbox, file)).catch(() => undefined);
            }
        }
        // Enforce max inbox size
        const remaining = msgFiles.filter((f) => f.endsWith('.json')).sort();
        if (remaining.length > cfg.max_inbox_size) {
            const toDelete = remaining.slice(0, remaining.length - cfg.max_inbox_size);
            for (const f of toDelete) {
                await unlink(join(inbox, f)).catch(() => undefined);
            }
        }
    }
}
export { DEFAULT_IPC_CONFIG };
//# sourceMappingURL=ipc.js.map