import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles, computeChanges } from '../lib/snapshot.js';
import { generateHandoffMarkdown } from '../lib/markdown.js';
import { compressChanges, extractQueryKeywords } from '../lib/compress.js';
import { loadAllDecisions } from '../lib/decisions.js';
import { generateInteropOutput } from '../lib/interop.js';
import {
  loadAgentState,
  saveAgentState,
  getAgentKnowledge,
  updateAgentKnowledge,
  computeDelta,
} from '../lib/agent-state.js';
import { SessionError, HandoffValidationError, FileError, ErrorCode } from '../lib/errors.js';
import { redactSecrets, validateHandoffContent } from '../lib/security.js';
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
    .option('--to <agent>', 'Target agent for delta export (only sends context new since last handoff to that agent)')
    .option('--for <query>', 'Task description to optimize context relevance (boosts query-relevant files)')
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
      to?: string;
      for?: string;
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
        throw new HandoffValidationError(ErrorCode.INVALID_FORMAT,
          `Invalid format: ${outputFormat}.`);
      }

      // Read session
      let session: Session;
      try {
        const sessionContent = await readFile(join(handoffDir, 'session.json'), 'utf-8');
        session = JSON.parse(sessionContent) as Session;
      } catch {
        throw new SessionError(ErrorCode.SESSION_NOT_FOUND, 'No active session.');
      }

      const config = await loadConfig(workingDir);

      // Walk and hash current files
      console.log('Scanning for changes...');
      const currentFiles = await walkFiles(workingDir, config.exclude_patterns);
      const currentHashes = await hashAllFiles(workingDir, currentFiles);

      // Compute all changes since init
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

      // Load decisions
      let allDecisions = options.includeDecisions
        ? (await loadAllDecisions(workingDir)).filter((d) => d.status === 'accepted' || d.status === 'proposed')
        : undefined;

      // Delta encoding: filter to only what's new for the target agent
      let deltaInfo: HandoffContext['delta'] | undefined;
      if (options.to) {
        const agentState = await loadAgentState(handoffDir);
        const agentKnowledge = getAgentKnowledge(agentState, options.to);
        const allDecisionIds = allDecisions?.map((d) => d.id) ?? [];

        const delta = computeDelta(changes, allDecisionIds, agentKnowledge);

        if (!delta.isFullHandoff) {
          console.log(
            `Delta for ${options.to}: ${delta.newChanges.length} new changes` +
            (delta.unchangedCount > 0 ? `, ${delta.unchangedCount} unchanged (skipped)` : '') +
            (delta.newDecisions.length > 0 ? `, ${delta.newDecisions.length} new decisions` : '')
          );
        }

        changes = delta.newChanges;
        if (allDecisions) {
          const newDecisionSet = new Set(delta.newDecisions);
          allDecisions = allDecisions.filter((d) => newDecisionSet.has(d.id));
        }

        deltaInfo = {
          isDelta: !delta.isFullHandoff,
          unchangedCount: delta.unchangedCount,
          targetAgent: options.to,
        };

        // After successful export, update agent state
        const allDecisionIds2 = allDecisions?.map((d) => d.id) ?? [];
        updateAgentKnowledge(agentState, options.to, changes, allDecisionIds2, {});
        await saveAgentState(handoffDir, agentState);
      }

      // Load memory files
      let memoryContents: Record<string, string> | undefined;
      if (options.includeMemory) {
        memoryContents = {};
        for (const memFile of config.memory_files) {
          try {
            const content = await readFile(join(workingDir, memFile), 'utf-8');
            memoryContents[memFile] = redactSecrets(content);
          } catch {
            // Memory file doesn't exist, skip
          }
        }
        if (Object.keys(memoryContents).length === 0) memoryContents = undefined;
      }

      // Run compression
      let compressionResult = undefined;
      if (options.compress || config.compression?.enabled) {
        const tokenBudget = parseInt(options.tokenBudget, 10) || config.compression?.token_budget || 8000;
        const compressionConfig = config.compression ?? {};

        // Build query context if --for was provided
        const queryKeywords = options.for ? extractQueryKeywords(options.for) : [];
        if (queryKeywords.length > 0) {
          console.log(`Query keywords: ${queryKeywords.join(', ')}`);
        }

        compressionResult = compressChanges(changes, {
          token_budget: tokenBudget,
          priority_threshold: compressionConfig.priority_threshold ?? 'low',
          query: queryKeywords.length > 0 ? { query: options.for!, keywords: queryKeywords } : undefined,
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
        decisions: allDecisions,
        delta: deltaInfo,
      };

      // Generate output
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

      validateHandoffContent(output);

      try {
        await writeFile(outputPath, output, 'utf-8');
      } catch (err) {
        throw new FileError(ErrorCode.FILE_WRITE_ERROR,
          `Failed to write output to ${outputPath}: ${(err as Error).message}`,
          { cause: err as Error });
      }

      // Update session
      session.last_export = new Date().toISOString();
      try {
        await writeFile(join(handoffDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
      } catch {
        // Non-fatal: export succeeded, session update failed
      }

      // Print summary
      const modified = changes.filter((c) => c.type === 'modified').length;
      const added = changes.filter((c) => c.type === 'added').length;
      const deleted = changes.filter((c) => c.type === 'deleted').length;

      console.log(`\nExported to ${outputPath}`);
      console.log(`Changes: ${modified} modified, ${added} added, ${deleted} deleted`);
      if (allDecisions && allDecisions.length > 0) {
        console.log(`Decisions: ${allDecisions.length} included`);
      }
    });
}
