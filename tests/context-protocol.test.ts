import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initIpc, updatePresence } from '../src/lib/ipc.js';
import {
  publishContext,
  hasNewContext,
  readContext,
  acknowledgeContext,
} from '../src/lib/context-protocol.js';

describe('publishContext', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ctx-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes HANDOFF.md to context directory', async () => {
    const content = '# Handoff\n\nTest content.';
    await publishContext(ipcDir, content, 'claude', 'sess-1');
    const ctx = await readContext(ipcDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.content).toBe(content);
  });

  it('writes metadata with correct fields', async () => {
    await publishContext(ipcDir, '# Test', 'claude', 'sess-1');
    const ctx = await readContext(ipcDir);
    expect(ctx!.meta.version).toBe('3.0');
    expect(ctx!.meta.last_updated_by).toBe('claude');
    expect(ctx!.meta.session_id).toBe('sess-1');
    expect(ctx!.meta.content_hash).toBeTruthy();
  });

  it('notifies active agents (sends message to inbox)', async () => {
    // Register a codex agent as present
    await updatePresence(ipcDir, 'codex', 'active');

    await publishContext(ipcDir, '# Content', 'claude', 'sess-1');

    // Check codex got a notification
    const { readInbox } = await import('../src/lib/ipc.js');
    const inbox = await readInbox(ipcDir, 'codex');
    const notification = inbox.find((m) => m.content === 'context-updated');
    expect(notification).toBeDefined();
  });

  it('does not notify the publisher itself', async () => {
    await updatePresence(ipcDir, 'claude', 'active');
    await publishContext(ipcDir, '# Content', 'claude', 'sess-1');

    const { readInbox } = await import('../src/lib/ipc.js');
    const inbox = await readInbox(ipcDir, 'claude');
    const selfNotif = inbox.find((m) => m.content === 'context-updated');
    expect(selfNotif).toBeUndefined();
  });

  it('updates content hash on new publish', async () => {
    await publishContext(ipcDir, '# First content', 'claude');
    const ctx1 = await readContext(ipcDir);
    const hash1 = ctx1!.meta.content_hash;

    await publishContext(ipcDir, '# Different content entirely', 'claude');
    const ctx2 = await readContext(ipcDir);
    const hash2 = ctx2!.meta.content_hash;

    expect(hash1).not.toBe(hash2);
  });
});

describe('hasNewContext', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ctx-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no context exists', async () => {
    const result = await hasNewContext(ipcDir, 'codex', 'somehash');
    expect(result).toBe(false);
  });

  it('returns true when no lastReadHash provided', async () => {
    await publishContext(ipcDir, '# Content', 'claude');
    const result = await hasNewContext(ipcDir, 'codex', undefined);
    expect(result).toBe(true);
  });

  it('returns false when hash matches', async () => {
    await publishContext(ipcDir, '# Content', 'claude');
    const ctx = await readContext(ipcDir);
    const hash = ctx!.meta.content_hash;
    const result = await hasNewContext(ipcDir, 'codex', hash);
    expect(result).toBe(false);
  });

  it('returns true when hash differs', async () => {
    await publishContext(ipcDir, '# Content', 'claude');
    const result = await hasNewContext(ipcDir, 'codex', 'old-hash-123');
    expect(result).toBe(true);
  });
});

describe('readContext', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ctx-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when context does not exist', async () => {
    const result = await readContext(ipcDir);
    expect(result).toBeNull();
  });

  it('returns context content and metadata after publish', async () => {
    const content = '# Test Handoff\n\nSome content.';
    await publishContext(ipcDir, content, 'claude');
    const ctx = await readContext(ipcDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.content).toBe(content);
    expect(ctx!.meta.last_updated_by).toBe('claude');
  });
});

describe('acknowledgeContext', () => {
  let tmpDir: string;
  let ipcDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-ctx-'));
    ipcDir = join(tmpDir, 'ipc');
    await initIpc(ipcDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not throw when context exists', async () => {
    await publishContext(ipcDir, '# Content', 'claude');
    await expect(acknowledgeContext(ipcDir, 'codex')).resolves.not.toThrow();
  });

  it('sends acknowledgement to publisher inbox', async () => {
    await publishContext(ipcDir, '# Content', 'claude', 'sess-1');
    await acknowledgeContext(ipcDir, 'codex');

    const { readInbox } = await import('../src/lib/ipc.js');
    const inbox = await readInbox(ipcDir, 'claude');
    const ack = inbox.find((m) => m.content === 'context-acknowledged');
    expect(ack).toBeDefined();
    expect(ack!.from).toBe('codex');
  });

  it('does not throw when no context exists', async () => {
    await expect(acknowledgeContext(ipcDir, 'codex')).resolves.not.toThrow();
  });
});
