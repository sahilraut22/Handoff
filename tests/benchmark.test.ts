import { describe, it, expect } from 'vitest';
import { runBenchmark, formatBenchmarkTable, formatBenchmarkJson, buildBenchmarkSuite } from '../src/lib/benchmark.js';

describe('runBenchmark', () => {
  it('returns a BenchmarkResult with correct shape', async () => {
    const result = await runBenchmark('test', () => { /* noop */ }, 10);
    expect(result.name).toBe('test');
    expect(result.iterations).toBe(10);
    expect(typeof result.mean_ms).toBe('number');
    expect(typeof result.median_ms).toBe('number');
    expect(typeof result.p95_ms).toBe('number');
    expect(typeof result.min_ms).toBe('number');
    expect(typeof result.max_ms).toBe('number');
    expect(typeof result.ops_per_sec).toBe('number');
  });

  it('min <= median <= max', async () => {
    const result = await runBenchmark('order-test', () => { /* noop */ }, 20);
    expect(result.min_ms).toBeLessThanOrEqual(result.median_ms);
    expect(result.median_ms).toBeLessThanOrEqual(result.max_ms);
  });

  it('mean is positive', async () => {
    const result = await runBenchmark('positive-mean', () => { /* noop */ }, 10);
    expect(result.mean_ms).toBeGreaterThanOrEqual(0);
  });

  it('works with async function', async () => {
    const result = await runBenchmark('async-test', async () => {
      await Promise.resolve();
    }, 5);
    expect(result.iterations).toBe(5);
    expect(result.mean_ms).toBeGreaterThanOrEqual(0);
  });

  it('p95 is between min and max', async () => {
    const result = await runBenchmark('p95-test', () => { /* noop */ }, 20);
    expect(result.p95_ms).toBeGreaterThanOrEqual(result.min_ms);
    expect(result.p95_ms).toBeLessThanOrEqual(result.max_ms);
  });
});

describe('formatBenchmarkTable', () => {
  it('returns a non-empty string', async () => {
    const result = await runBenchmark('table-test', () => { /* noop */ }, 5);
    const table = formatBenchmarkTable([result]);
    expect(typeof table).toBe('string');
    expect(table.length).toBeGreaterThan(0);
  });

  it('contains column headers', async () => {
    const result = await runBenchmark('headers-test', () => { /* noop */ }, 5);
    const table = formatBenchmarkTable([result]);
    expect(table).toContain('Name');
    expect(table).toContain('Mean');
    expect(table).toContain('Median');
    expect(table).toContain('ops/s');
  });

  it('contains the benchmark name', async () => {
    const result = await runBenchmark('my-benchmark', () => { /* noop */ }, 5);
    const table = formatBenchmarkTable([result]);
    expect(table).toContain('my-benchmark');
  });

  it('handles multiple results', async () => {
    const r1 = await runBenchmark('bench-a', () => { /* noop */ }, 5);
    const r2 = await runBenchmark('bench-b', () => { /* noop */ }, 5);
    const table = formatBenchmarkTable([r1, r2]);
    expect(table).toContain('bench-a');
    expect(table).toContain('bench-b');
  });
});

describe('formatBenchmarkJson', () => {
  it('returns valid JSON', async () => {
    const result = await runBenchmark('json-test', () => { /* noop */ }, 5);
    const suite = buildBenchmarkSuite([result]);
    const json = formatBenchmarkJson(suite);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('JSON contains system info', async () => {
    const result = await runBenchmark('sys-test', () => { /* noop */ }, 5);
    const suite = buildBenchmarkSuite([result]);
    const parsed = JSON.parse(formatBenchmarkJson(suite)) as { system: { node: string; platform: string; cpus: number }; timestamp: string };
    expect(parsed.system.node).toBeTruthy();
    expect(parsed.system.platform).toBeTruthy();
    expect(typeof parsed.system.cpus).toBe('number');
    expect(parsed.timestamp).toBeTruthy();
  });
});

describe('buildBenchmarkSuite', () => {
  it('includes system info', async () => {
    const result = await runBenchmark('suite-test', () => { /* noop */ }, 5);
    const suite = buildBenchmarkSuite([result]);
    expect(suite.system.node).toBe(process.version);
    expect(suite.system.platform).toBe(process.platform);
    expect(suite.system.arch).toBe(process.arch);
    expect(suite.system.cpus).toBeGreaterThan(0);
  });

  it('includes all results', async () => {
    const r1 = await runBenchmark('r1', () => { /* noop */ }, 5);
    const r2 = await runBenchmark('r2', () => { /* noop */ }, 5);
    const suite = buildBenchmarkSuite([r1, r2]);
    expect(suite.results.length).toBe(2);
  });
});
