import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateHandoff } from '../lib/protocol.js';
import { FileError, ErrorCode } from '../lib/errors.js';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate [file]')
    .description('Validate a HANDOFF.md file against the protocol spec')
    .option('--strict', 'Treat warnings as errors')
    .action(async (file: string | undefined, options: { strict?: boolean }) => {
      const workingDir = resolve(process.cwd());
      const filePath = file ? resolve(file) : join(workingDir, 'HANDOFF.md');

      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        throw new FileError(ErrorCode.FILE_NOT_FOUND,
          `Cannot read file: ${filePath}`,
          { recoveryHint: "Run 'handoff export' to generate a HANDOFF.md first." });
      }

      const result = validateHandoff(content);

      const errors = result.errors.filter((e) => e.severity === 'error');
      const warnings = result.errors.filter((e) => e.severity === 'warning');

      if (errors.length === 0 && warnings.length === 0) {
        console.log(`PASS ${filePath}`);
        console.log('HANDOFF.md is valid and up to spec.');
        process.exit(0);
      }

      if (errors.length > 0) {
        console.error(`FAIL ${filePath}`);
        console.error('');
        console.error('Errors:');
        for (const err of errors) {
          console.error(`  [error] ${err.field}: ${err.message}`);
        }
      }

      if (warnings.length > 0) {
        if (errors.length === 0) {
          console.log(`WARN ${filePath}`);
          console.log('');
        }
        console.log('Warnings:');
        for (const warn of warnings) {
          console.log(`  [warn]  ${warn.field}: ${warn.message}`);
        }
      }

      const failDueToWarnings = options.strict && warnings.length > 0;
      if (!result.valid || failDueToWarnings) {
        process.exit(1);
      }
    });
}
