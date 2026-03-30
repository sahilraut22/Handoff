import { createHash } from 'node:crypto';
import { compressChanges } from '../lib/compress.js';
import { estimateTokens } from '../lib/tokens.js';
import { extractEntities } from '../lib/semantic.js';
import { serializeDecision, parseDecision } from '../lib/yaml-lite.js';
import { parseFrontmatter } from '../lib/protocol.js';
import { generateHandoffMarkdown } from '../lib/markdown.js';
import { generateDiff } from '../lib/snapshot.js';
import { runBenchmark, formatBenchmarkTable, formatBenchmarkJson, buildBenchmarkSuite } from '../lib/benchmark.js';
function makeSyntheticChanges(n) {
    const changes = [];
    const types = ['src/lib/core.ts', 'src/api/routes.ts', 'src/utils/format.ts', 'README.md', 'package.json'];
    for (let i = 0; i < n; i++) {
        const path = types[i % types.length].replace('.ts', `${i}.ts`);
        changes.push({
            path,
            type: 'modified',
            diff: `--- a/${path}\n+++ b/${path}\n@@ -1,5 +1,5 @@\n line1\n-old${i}\n+new${i}\n line3\n line4\n line5`,
            linesAdded: 1,
            linesRemoved: 1,
        });
    }
    return changes;
}
const SAMPLE_TS = `
import { foo } from './foo.js';
import { bar } from './bar.js';

export function processData(input: string): string {
  const result = input.trim();
  return result.toUpperCase();
}

export class DataProcessor {
  private value: string;
  constructor(value: string) {
    this.value = value;
  }
  process(): string {
    return this.value.toLowerCase();
  }
}

export interface ProcessOptions {
  trim: boolean;
  uppercase: boolean;
}

export type ProcessResult = { success: boolean; data: string };

const helper = (x: number): number => x * 2;
`.repeat(10); // ~200 lines
const SAMPLE_HANDOFF_FRONTMATTER = `---
handoff_version: "2.0"
session_id: "d4362e6b-2bfe-4239-a18e-cb6c333a039a"
created_at: "2026-03-28T18:35:32.126Z"
duration: "14h 35m"
working_dir: "/home/user/project"
agent: "claude"
changes:
  modified: 5
  added: 3
  deleted: 1
compression:
  enabled: true
  token_budget: 8000
  tokens_used: 6200
priority_files:
  - "src/auth.ts"
  - "package.json"
decisions_included: 2
---

# Handoff Context
`;
export function registerBenchmarkCommand(program) {
    program
        .command('benchmark')
        .description('Run performance benchmarks for handoff internals')
        .option('-n, --iterations <n>', 'Number of iterations per benchmark', '50')
        .option('--json', 'Output results as JSON')
        .option('--filter <pattern>', 'Only run benchmarks matching pattern')
        .action(async (options) => {
        const iterations = Math.max(1, parseInt(options.iterations, 10) || 50);
        const filter = options.filter?.toLowerCase();
        const BENCHMARKS = [
            {
                name: 'hash-compute',
                fn: () => {
                    const hash = createHash('sha256');
                    hash.update('x'.repeat(1024));
                    hash.digest('hex');
                },
            },
            {
                name: 'diff-generate',
                fn: () => {
                    const oldContent = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
                    const newContent = Array.from({ length: 200 }, (_, i) => i === 100 ? `changed line ${i}` : `line ${i}`).join('\n');
                    generateDiff(oldContent, newContent, 'test.ts', 3);
                },
            },
            {
                name: 'compress-pipeline',
                fn: () => {
                    const changes = makeSyntheticChanges(20);
                    compressChanges(changes, { token_budget: 4000 });
                },
            },
            {
                name: 'token-estimate',
                fn: () => {
                    estimateTokens('x'.repeat(10000));
                },
            },
            {
                name: 'token-estimate-code',
                fn: () => {
                    estimateTokens(SAMPLE_TS);
                },
            },
            {
                name: 'semantic-extract',
                fn: () => {
                    extractEntities(SAMPLE_TS, 'typescript');
                },
            },
            {
                name: 'yaml-roundtrip',
                fn: () => {
                    const decision = {
                        id: 'abc12345',
                        title: 'Use JWT for auth',
                        status: 'accepted',
                        date: new Date().toISOString(),
                        context: 'Need stateless auth',
                        decision: 'JWT with RS256',
                        alternatives: ['session cookies', 'oauth2'],
                        tags: ['auth', 'security'],
                    };
                    const yaml = serializeDecision(decision);
                    parseDecision(yaml);
                },
            },
            {
                name: 'frontmatter-parse',
                fn: () => {
                    parseFrontmatter(SAMPLE_HANDOFF_FRONTMATTER);
                },
            },
            {
                name: 'markdown-generate',
                fn: () => {
                    const changes = makeSyntheticChanges(10);
                    const context = {
                        session: {
                            session_id: 'test-session',
                            created_at: new Date().toISOString(),
                            working_dir: '/tmp/project',
                            file_hashes: {},
                            excluded_patterns: [],
                        },
                        changes,
                        message: 'Test handoff',
                        include_memory: false,
                        config: {
                            exclude_patterns: [],
                            max_diff_lines: 50,
                            diff_context_lines: 3,
                            tmux_capture_timeout_ms: 10000,
                            memory_files: [],
                        },
                    };
                    generateHandoffMarkdown(context);
                },
            },
        ];
        const toRun = filter
            ? BENCHMARKS.filter((b) => b.name.toLowerCase().includes(filter))
            : BENCHMARKS;
        if (toRun.length === 0) {
            console.error(`No benchmarks match filter: ${options.filter}`);
            process.exit(1);
        }
        if (!options.json) {
            console.log(`Running ${toRun.length} benchmark${toRun.length !== 1 ? 's' : ''} (${iterations} iterations each)...\n`);
        }
        const results = [];
        for (const bench of toRun) {
            if (!options.json) {
                process.stdout.write(`  ${bench.name}...`);
            }
            const result = await runBenchmark(bench.name, bench.fn, iterations);
            results.push(result);
            if (!options.json) {
                process.stdout.write(` ${result.mean_ms}ms avg\n`);
            }
        }
        const suite = buildBenchmarkSuite(results);
        if (options.json) {
            console.log(formatBenchmarkJson(suite));
        }
        else {
            console.log('');
            console.log(formatBenchmarkTable(results));
            console.log(`\nNode ${suite.system.node} | ${suite.system.platform}/${suite.system.arch} | ${suite.system.cpus} CPUs`);
        }
    });
}
//# sourceMappingURL=benchmark.js.map