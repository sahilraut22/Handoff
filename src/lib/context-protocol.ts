/**
 * Shared context file management for cross-platform IPC.
 * Manages the HANDOFF.md file in .handoff/ipc/context/ and notifies agents.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sendMessage, getPresences, isAgentAlive } from './ipc.js';
import { logger } from './logger.js';
import type { ContextFile, IpcMessage } from '../types/index.js';

const CONTEXT_DIR = 'context';
const HANDOFF_FILE = 'HANDOFF.md';
const META_FILE = 'meta.json';

function contextDir(ipcDir: string): string {
  return join(ipcDir, CONTEXT_DIR);
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Publish updated context and notify all present agents.
 */
export async function publishContext(
  ipcDir: string,
  handoffContent: string,
  updatedBy: string,
  sessionId = 'unknown'
): Promise<void> {
  const ctxDir = contextDir(ipcDir);
  await mkdir(ctxDir, { recursive: true });

  const hash = contentHash(handoffContent);
  const now = new Date().toISOString();

  // Write HANDOFF.md
  const handoffPath = join(ctxDir, HANDOFF_FILE);
  await writeFile(handoffPath, handoffContent, 'utf-8');

  // Get active agents to notify
  const presences = await getPresences(ipcDir);
  const activeAgents = presences
    .filter((p) => p.agent !== updatedBy && isAgentAlive(p))
    .map((p) => p.agent);

  // Write metadata
  const meta: ContextFile = {
    version: '3.0',
    session_id: sessionId,
    last_updated: now,
    last_updated_by: updatedBy,
    content_hash: hash,
    agents_notified: activeAgents,
  };
  await writeFile(join(ctxDir, META_FILE), JSON.stringify(meta, null, 2), 'utf-8');

  // Notify active agents
  for (const agent of activeAgents) {
    const msg: IpcMessage = {
      id: `ctx-${Date.now()}-${agent}`,
      from: updatedBy,
      to: agent,
      timestamp: now,
      type: 'event',
      content: 'context-updated',
      metadata: { hash, session_id: sessionId },
    };
    await sendMessage(ipcDir, msg).catch((err) => {
      logger.warn('Failed to notify agent of context update', { agent, error: (err as Error).message });
    });
  }

  logger.info('Context published', { hash, notified: activeAgents.length });
}

/**
 * Check if context has been updated since agent's last read.
 */
export async function hasNewContext(
  ipcDir: string,
  agent: string,
  lastReadHash?: string
): Promise<boolean> {
  try {
    const metaContent = await readFile(join(contextDir(ipcDir), META_FILE), 'utf-8');
    const meta = JSON.parse(metaContent) as ContextFile;

    if (!lastReadHash) return true;
    return meta.content_hash !== lastReadHash;
  } catch {
    return false;
  }
}

/**
 * Read the latest context file and metadata.
 */
export async function readContext(
  ipcDir: string
): Promise<{ content: string; meta: ContextFile } | null> {
  const ctxDir = contextDir(ipcDir);

  try {
    const [content, metaContent] = await Promise.all([
      readFile(join(ctxDir, HANDOFF_FILE), 'utf-8'),
      readFile(join(ctxDir, META_FILE), 'utf-8'),
    ]);
    const meta = JSON.parse(metaContent) as ContextFile;
    return { content, meta };
  } catch {
    return null;
  }
}

/**
 * Mark agent as having read the latest context.
 * Sends an acknowledgement message back to the publisher.
 */
export async function acknowledgeContext(ipcDir: string, agent: string): Promise<void> {
  try {
    const metaContent = await readFile(join(contextDir(ipcDir), META_FILE), 'utf-8');
    const meta = JSON.parse(metaContent) as ContextFile;

    const ackMsg: IpcMessage = {
      id: `ack-${Date.now()}-${agent}`,
      from: agent,
      to: meta.last_updated_by,
      timestamp: new Date().toISOString(),
      type: 'event',
      content: 'context-acknowledged',
      metadata: { hash: meta.content_hash },
    };

    await sendMessage(ipcDir, ackMsg);
    logger.debug('Context acknowledged', { agent, hash: meta.content_hash });
  } catch {
    // Non-fatal: acknowledgement failure
  }
}
