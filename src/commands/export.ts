import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles, computeChanges } from '../lib/snapshot.js';
import { generateHandoffMarkdown } from '../lib/markdown.js';
import type { Session, HandoffContext } from '../types/index.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export current session context for handoff to another agent.')
    .option('--no-diff', 'Skip full diffs, only list files')
    .option('-m, --message <msg>', 'Add summary message')
    .option('--include-memory', 'Include contents of agent memory files (CLAUDE.md, AGENTS.md, etc.)')
    .option('-o, --output <path>', 'Custom output path (default: HANDOFF.md in project root)')
    .option('-d, --dir <path>', 'Target directory (default: current directory)')
    .action(async (options: {
      diff: boolean;
      message?: string;
      includeMemory?: boolean;
      output?: string;
      dir?: string;
    }) => {
      const workingDir = resolve(options.dir ?? process.cwd());
      const handoffDir = join(workingDir, '.handoff');
      const snapshotDir = join(handoffDir, 'snapshots');

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
      const changes = await computeChanges(
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

      // Build context
      const context: HandoffContext = {
        session,
        changes,
        message: options.message,
        include_memory: options.includeMemory ?? false,
        memory_contents: memoryContents,
        config,
      };

      // Generate HANDOFF.md
      const markdown = generateHandoffMarkdown(context);
      const outputPath = options.output ?? join(workingDir, 'HANDOFF.md');
      await writeFile(outputPath, markdown, 'utf-8');

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
    });
}
