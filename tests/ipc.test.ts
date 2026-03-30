import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initIpc,
  sendMessage,
  readInbox,
  updatePresence,
  getPresences,
  isAgentAlive,
  cleanupIpc,
} from '../src/lib/ipc.js';
import type { IpcMessage } from '../src/types/index.js';

function makeMessage(overrides: Partial<IpcMessage> = {}): IpcMessage {
  return {
    id: `test-${Date.now()}`,
    from: 'claude',
    to: 'codex',
    timestamp: new Date().toISOString(),
    type: 'text',
    content: 'Hello from claude',
    ...overrides,
  };
}

describe('initIpc', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ipc-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates ipc directory structure', async () => {
    const ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
    const { access } = await import('node:fs/promises');
    await expect(access(join(ipcDir, 'agents'))).resolves.not.toThrow();
    await expect(access(join(ipcDir, 'context'))).resolves.not.toThrow();
  });

  it('is idempotent (can be called multiple times)', async () => {
    const ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
    await expect(initIpc(ipcDir)).resolves.not.toThrow();
  });
});

describe('sendMessage / readInbox', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ipc-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('sends a message and reads it back', async () => {
    const msg = makeMessage();
    await sendMessage(ipcDir, msg);
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(1);
    expect(inbox[0]!.content).toBe('Hello from claude');
    expect(inbox[0]!.from).toBe('claude');
  });

  it('reads multiple messages in order', async () => {
    for (let i = 0; i < 3; i++) {
      await sendMessage(ipcDir, makeMessage({ id: `msg-${i}`, content: `Message ${i}` }));
      await new Promise((r) => setTimeout(r, 5)); // ensure ordering
    }
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(3);
  });

  it('returns empty array when inbox is empty', async () => {
    const inbox = await readInbox(ipcDir, 'noagent');
    expect(inbox).toEqual([]);
  });

  it('deletes messages after read when deleteAfterRead is true', async () => {
    await sendMessage(ipcDir, makeMessage());
    await readInbox(ipcDir, 'codex', { deleteAfterRead: true });
    const inbox2 = await readInbox(ipcDir, 'codex');
    expect(inbox2.length).toBe(0);
  });

  it('filters expired messages by TTL', async () => {
    const expiredMsg = makeMessage({
      timestamp: new Date(Date.now() - 400000).toISOString(), // 400s ago
      ttl_ms: 300000, // 5 min TTL
    });
    await sendMessage(ipcDir, expiredMsg);
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(0);
  });

  it('keeps messages within TTL', async () => {
    const freshMsg = makeMessage({ ttl_ms: 300000 });
    await sendMessage(ipcDir, freshMsg);
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(1);
  });
});

describe('updatePresence / getPresences', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ipc-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('registers agent presence', async () => {
    await updatePresence(ipcDir, 'claude', 'active');
    const presences = await getPresences(ipcDir);
    expect(presences.length).toBe(1);
    expect(presences[0]!.agent).toBe('claude');
    expect(presences[0]!.status).toBe('active');
  });

  it('updates existing presence', async () => {
    await updatePresence(ipcDir, 'claude', 'active');
    await updatePresence(ipcDir, 'claude', 'idle');
    const presences = await getPresences(ipcDir);
    expect(presences.length).toBe(1);
    expect(presences[0]!.status).toBe('idle');
  });

  it('returns multiple agent presences', async () => {
    await updatePresence(ipcDir, 'claude', 'active');
    await updatePresence(ipcDir, 'codex', 'idle');
    const presences = await getPresences(ipcDir);
    expect(presences.length).toBe(2);
  });

  it('stores current PID', async () => {
    await updatePresence(ipcDir, 'claude');
    const presences = await getPresences(ipcDir);
    expect(presences[0]!.pid).toBe(process.pid);
  });
});

describe('isAgentAlive', () => {
  it('returns true for fresh heartbeat', () => {
    const presence = {
      agent: 'claude',
      status: 'active' as const,
      last_heartbeat: new Date().toISOString(),
      pid: process.pid,
    };
    expect(isAgentAlive(presence, 30000)).toBe(true);
  });

  it('returns false for stale heartbeat', () => {
    const presence = {
      agent: 'claude',
      status: 'idle' as const,
      last_heartbeat: new Date(Date.now() - 60000).toISOString(), // 60s ago
      pid: 12345,
    };
    expect(isAgentAlive(presence, 30000)).toBe(false);
  });
});

describe('cleanupIpc', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ipc-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes expired messages during cleanup', async () => {
    const expiredMsg = makeMessage({
      timestamp: new Date(Date.now() - 400000).toISOString(),
      ttl_ms: 300000,
    });
    await sendMessage(ipcDir, expiredMsg);
    await cleanupIpc(ipcDir);
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(0);
  });

  it('preserves fresh messages during cleanup', async () => {
    await sendMessage(ipcDir, makeMessage({ ttl_ms: 300000 }));
    await cleanupIpc(ipcDir);
    const inbox = await readInbox(ipcDir, 'codex');
    expect(inbox.length).toBe(1);
  });
});
