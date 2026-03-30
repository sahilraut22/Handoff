import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isDaemonRunning,
  writePidFile,
  removePidFile,
} from '../src/lib/daemon.js';

describe('isDaemonRunning', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-daemon-'));
    await mkdir(join(tmpDir, '.handoff'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no PID file exists', async () => {
    const running = await isDaemonRunning(tmpDir);
    expect(running).toBe(false);
  });

  it('returns true when PID file contains current process PID', async () => {
    const pidFile = join(tmpDir, '.handoff', 'daemon.pid');
    await writePidFile(pidFile);
    const running = await isDaemonRunning(tmpDir);
    expect(running).toBe(true);
  });

  it('returns false when PID file contains non-existent PID', async () => {
    const pidFile = join(tmpDir, '.handoff', 'daemon.pid');
    // Use a PID that is very unlikely to exist
    await writeFile(pidFile, '999999999', 'utf-8');
    const running = await isDaemonRunning(tmpDir);
    expect(running).toBe(false);
  });

  it('returns false when PID file contains invalid content', async () => {
    const pidFile = join(tmpDir, '.handoff', 'daemon.pid');
    await writeFile(pidFile, 'not-a-pid', 'utf-8');
    const running = await isDaemonRunning(tmpDir);
    expect(running).toBe(false);
  });
});

describe('writePidFile / removePidFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-daemon-'));
    await mkdir(join(tmpDir, '.handoff'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes current PID to file', async () => {
    const pidFile = join(tmpDir, '.handoff', 'daemon.pid');
    await writePidFile(pidFile);
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(pidFile, 'utf-8');
    expect(parseInt(content, 10)).toBe(process.pid);
  });

  it('removePidFile cleans up successfully', async () => {
    const pidFile = join(tmpDir, '.handoff', 'daemon.pid');
    await writePidFile(pidFile);
    await removePidFile(pidFile);
    const running = await isDaemonRunning(tmpDir);
    expect(running).toBe(false);
  });

  it('removePidFile does not throw if file does not exist', async () => {
    const pidFile = join(tmpDir, '.handoff', 'nonexistent.pid');
    await expect(removePidFile(pidFile)).resolves.not.toThrow();
  });
});
