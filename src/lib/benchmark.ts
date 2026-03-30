import { cpus } from 'node:os';

export interface BenchmarkResult {
  name: string;
  iterations: number;
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  ops_per_sec: number;
}

export interface BenchmarkSuite {
  results: BenchmarkResult[];
  system: {
    node: string;
    platform: string;
    arch: string;
    cpus: number;
  };
  timestamp: string;
}

/**
 * Run a benchmark: warm-up 5 iterations (discarded), then measure `iterations` runs.
 * Returns statistical summary.
 */
export async function runBenchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations = 50
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 5; i++) {
    await fn();
  }

  // Measure
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }

  durations.sort((a, b) => a - b);

  const sum = durations.reduce((a, b) => a + b, 0);
  const mean = sum / durations.length;
  const median = durations[Math.floor(durations.length / 2)]!;
  const p95 = durations[Math.floor(durations.length * 0.95)]!;
  const min = durations[0]!;
  const max = durations[durations.length - 1]!;
  const opsPerSec = mean > 0 ? Math.round(1000 / mean) : 0;

  return {
    name,
    iterations,
    mean_ms: Math.round(mean * 1000) / 1000,
    median_ms: Math.round(median * 1000) / 1000,
    p95_ms: Math.round(p95 * 1000) / 1000,
    min_ms: Math.round(min * 1000) / 1000,
    max_ms: Math.round(max * 1000) / 1000,
    ops_per_sec: opsPerSec,
  };
}

/**
 * Format benchmark results as an ASCII table.
 */
export function formatBenchmarkTable(results: BenchmarkResult[]): string {
  const headers = ['Name', 'Iters', 'Mean', 'Median', 'p95', 'Min', 'Max', 'ops/s'];
  const rows = results.map((r) => [
    r.name,
    String(r.iterations),
    `${r.mean_ms}ms`,
    `${r.median_ms}ms`,
    `${r.p95_ms}ms`,
    `${r.min_ms}ms`,
    `${r.max_ms}ms`,
    String(r.ops_per_sec),
  ]);

  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, ci) =>
    Math.max(...allRows.map((row) => (row[ci] ?? '').length))
  );

  const separator = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const formatRow = (row: string[]) =>
    '| ' + row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join(' | ') + ' |';

  const lines = [
    separator,
    formatRow(headers),
    separator,
    ...rows.map(formatRow),
    separator,
  ];

  return lines.join('\n');
}

/**
 * Format benchmark suite as JSON string.
 */
export function formatBenchmarkJson(suite: BenchmarkSuite): string {
  return JSON.stringify(suite, null, 2);
}

/**
 * Build a BenchmarkSuite from a list of results.
 */
export function buildBenchmarkSuite(results: BenchmarkResult[]): BenchmarkSuite {
  return {
    results,
    system: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: cpus().length,
    },
    timestamp: new Date().toISOString(),
  };
}
