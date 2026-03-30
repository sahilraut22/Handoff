import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger, appendQueryLog, readQueryLog } from '../src/lib/logger.js';

describe('Logger singleton', () => {
  let stderrOutput: string[] = [];

  beforeEach(() => {
    stderrOutput = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    // Reset to known state
    logger.setLevel('debug');
    logger.setJsonMode(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    logger.setLevel('info');
    logger.setJsonMode(false);
  });

  it('text format: includes level prefix', () => {
    logger.debug('hello world');
    expect(stderrOutput.some((s) => s.includes('[DEBUG]') && s.includes('hello world'))).toBe(true);
  });

  it('does not log below current level', () => {
    logger.setLevel('warn');
    logger.debug('should not appear');
    logger.info('should not appear either');
    expect(stderrOutput.filter((s) => s.includes('should not appear')).length).toBe(0);
  });

  it('logs at and above current level', () => {
    logger.setLevel('warn');
    logger.warn('this should appear');
    logger.error('this too');
    expect(stderrOutput.some((s) => s.includes('this should appear'))).toBe(true);
    expect(stderrOutput.some((s) => s.includes('this too'))).toBe(true);
  });

  it('silent level suppresses all output', () => {
    logger.setLevel('silent');
    logger.debug('x');
    logger.info('x');
    logger.warn('x');
    logger.error('x');
    expect(stderrOutput.length).toBe(0);
  });

  it('json mode outputs valid JSON', () => {
    logger.setJsonMode(true);
    logger.info('test message', { key: 'value' });
    const jsonLines = stderrOutput.filter((s) => s.trim().startsWith('{'));
    expect(jsonLines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonLines[0]) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['message']).toBe('test message');
    expect(typeof parsed['timestamp']).toBe('string');
  });

  it('json mode includes context', () => {
    logger.setJsonMode(true);
    logger.info('with context', { foo: 'bar', count: 42 });
    const jsonLine = stderrOutput.find((s) => s.includes('"with context"'));
    expect(jsonLine).toBeTruthy();
    const parsed = JSON.parse(jsonLine!) as Record<string, unknown>;
    const ctx = parsed['context'] as Record<string, unknown>;
    expect(ctx['foo']).toBe('bar');
    expect(ctx['count']).toBe(42);
  });

  it('text format includes context as key=value', () => {
    logger.setJsonMode(false);
    logger.debug('msg with ctx', { path: '/foo/bar' });
    expect(stderrOutput.some((s) => s.includes('path=') && s.includes('/foo/bar'))).toBe(true);
  });

  it('time() returns a function that logs elapsed time', async () => {
    const stop = logger.time('test-op');
    await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(stderrOutput.some((s) => s.includes('test-op') && s.includes('elapsed_ms'))).toBe(true);
  });

  it('json mode omits context key when context is empty', () => {
    logger.setJsonMode(true);
    logger.info('no ctx');
    const jsonLine = stderrOutput.find((s) => s.includes('"no ctx"'));
    expect(jsonLine).toBeTruthy();
    const parsed = JSON.parse(jsonLine!) as Record<string, unknown>;
    expect(parsed['context']).toBeUndefined();
  });
});

describe('appendQueryLog / readQueryLog', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-logger-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('appendQueryLog creates log file and readQueryLog parses it', async () => {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: 'claude',
      question: 'What is the meaning?',
    };
    await appendQueryLog(tmpDir, entry);
    const entries = await readQueryLog(tmpDir);
    expect(entries.length).toBe(1);
    expect(entries[0].agent).toBe('claude');
    expect(entries[0].question).toBe('What is the meaning?');
  });

  it('readQueryLog returns empty array if file missing', async () => {
    const entries = await readQueryLog(tmpDir);
    expect(entries).toEqual([]);
  });

  it('appendQueryLog silently handles write errors', async () => {
    // Use a path that can't be written
    await expect(appendQueryLog('/nonexistent/deeply/nested', { timestamp: '', agent: '', question: '' }))
      .resolves.toBeUndefined();
  });

  it('appends multiple entries', async () => {
    for (let i = 0; i < 3; i++) {
      await appendQueryLog(tmpDir, { timestamp: new Date().toISOString(), agent: 'bot', question: `q${i}` });
    }
    const entries = await readQueryLog(tmpDir);
    expect(entries.length).toBe(3);
  });
});
