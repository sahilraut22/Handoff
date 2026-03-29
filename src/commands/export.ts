import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles, computeChanges } from '../lib/snapshot.js';
import { generateHandoffMarkdown } from '../lib/markdown.js';
import { compressChanges } from '../lib/compress.js';
import { loadAllDecisions } from '../lib/decisions.js';
import { generateInteropOutput } from '../lib/interop.js';
import type { Session, HandoffContext } from '../types/index.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export current session context for handoff to another agent.')
    .option('--no-diff', 'Skip full diffs, only list files')
    .option('-m, --message <msg>', 'Add summary message')
    .option('--include-memory', 'Include contents of agent memory files (CLAUDE.md, AGENTS.md, etc.)')
    .option('--include-decisions', 'Include accepted decisions in output')
    .option('--compress', 'Enable intelligent compression with token budgeting')
    .option('--token-budget <n>', 'Token budget for compression (default: 8000)', '8000')
    .option('--format <fmt>', 'Output format: markdown (default), json, claude, agents')
    .option('-o, --output <path>', 'Custom output path (default: HANDOFF.md in project root)')
    .option('-d, --dir <path>', 'Target directory (default: current directory)')
    .action(async (options: {
      diff: boolean;
      message?: string;
      includeMemory?: boolean;
      includeDecisions?: boolean;
      compress?: boolean;
      tokenBudget: string;
      format?: string;
      output?: string;
      dir?: string;
    }) => {
      const workingDir = resolve(options.dir ?? process.cwd());
      const handoffDir = join(workingDir, '.handoff');
      const snapshotDir = join(handoffDir, 'snapshots');

      // Validate format option
      const validFormats = ['markdown', 'json', 'claude', 'agents'];
      const outputFormat = options.format ?? 'markdown';
      if (!validFormats.includes(outputFormat)) {
        console.error(`Invalid format: ${outputFormat}. Must be one of: ${validFormats.join(', ')}`);
        process.exit(1);
      }

      // Read session
      let session: Session;
      try {
        const sessionContent = await readFile(join(handoffDir, 'session.json'), 'utf-8');
        session = JSON.parse(sessionContent) as Session;
      } catch {
        console.error('No active session. Run `handoff init` first.');
        process.exit(1);
      }

      const config = await loadConfig(workingDir);

      // Walk and hash current files
      console.log('Scanning for changes...');
      const currentFiles = await walkFiles(workingDir, config.exclude_patterns);
      const currentHashes = await hashAllFiles(workingDir, currentFiles);

      // Compute changes
      let changes = await computeChanges(
        workingDir,
        snapshotDir,
        session.file_hashes,
        currentHashes,
        config
      );

      // Strip diffs if --no-diff
      if (!options.diff) {
        for (const change of changes) {
          delete change.diff;
        }
      }

      // Load memory files if requested
      let memoryContents: Record<string, string> | undefined;
      if (options.includeMemory) {
        memoryContents = {};
        for (const memFile of config.memory_files) {
          try {
            const content = await readFile(join(workingDir, memFile), 'utf-8');
            memoryContents[memFile] = content;
          } catch {
            // Memory file doesn't exist, skip
          }
        }
        if (Object.keys(memoryContents).length === 0) {
          memoryContents = undefined;
        }
      }

      // Load decisions if requested
      let decisions = undefined;
      if (options.includeDecisions) {
        const allDecisions = await loadAllDecisions(workingDir);
        decisions = allDecisions.filter((d) => d.status === 'accepted' || d.status === 'proposed');
      }

      // Run compression if requested
      let compressionResult = undefined;
      if (options.compress) {
        const tokenBudget = parseInt(options.tokenBudget, 10) || 8000;
        const compressionConfig = config.compression ?? {};
        compressionResult = compressChanges(changes, {
          token_budget: tokenBudget,
          priority_threshold: compressionConfig.priority_threshold ?? 'low',
        });
        changes = compressionResult.changes;
        console.log(
          `Compressed: ${compressionResult.stats.total_changes} changes -> ${compressionResult.stats.included_changes} shown` +
          ` (~${compressionResult.stats.estimated_tokens.toLocaleString()} / ${tokenBudget.toLocaleString()} tokens, ${compressionResult.stats.budget_used_pct}% used)`
        );
      }

      // Build context
      const context: HandoffContext = {
        session,
        changes,
        message: options.message,
        include_memory: options.includeMemory ?? false,
        memory_contents: memoryContents,
        config,
        compression_result: compressionResult,
        decisions,
      };

      // Generate output in requested format
      let output: string;
      let defaultFilename = 'HANDOFF.md';

      if (outputFormat === 'json') {
        output = generateInteropOutput(context, 'json');
        defaultFilename = 'HANDOFF.json';
      } else if (outputFormat === 'claude') {
        output = generateInteropOutput(context, 'claude');
        defaultFilename = 'CLAUDE.md';
      } else if (outputFormat === 'agents') {
        output = generateInteropOutput(context, 'agents');
        defaultFilename = 'AGENTS.md';
      } else {
        output = generateHandoffMarkdown(context);
      }

      const outputPath = options.output ?? join(workingDir, defaultFilename);
      await writeFile(outputPath, output, 'utf-8');

      // Update session with last export time
      session.last_export = new Date().toISOString();
      await writeFile(
        join(handoffDir, 'session.json'),
        JSON.stringify(session, null, 2),
        'utf-8'
      );

      // Print summary
      const modified = changes.filter((c) => c.type === 'modified').length;
      const added = changes.filter((c) => c.type === 'added').length;
      const deleted = changes.filter((c) => c.type === 'deleted').length;

      console.log(`\nExported to ${outputPath}`);
      console.log(`Changes: ${modified} modified, ${added} added, ${deleted} deleted`);
      if (decisions && decisions.length > 0) {
        console.log(`Decisions: ${decisions.length} included`);
      }
    });
}
