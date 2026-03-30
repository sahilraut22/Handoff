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
export declare function runBenchmark(name: string, fn: () => Promise<void> | void, iterations?: number): Promise<BenchmarkResult>;
/**
 * Format benchmark results as an ASCII table.
 */
export declare function formatBenchmarkTable(results: BenchmarkResult[]): string;
/**
 * Format benchmark suite as JSON string.
 */
export declare function formatBenchmarkJson(suite: BenchmarkSuite): string;
/**
 * Build a BenchmarkSuite from a list of results.
 */
export declare function buildBenchmarkSuite(results: BenchmarkResult[]): BenchmarkSuite;
