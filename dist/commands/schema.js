import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HANDOFF_SCHEMA } from '../lib/schema.js';
import { FileError, ErrorCode } from '../lib/errors.js';
export function registerSchemaCommand(program) {
    program
        .command('schema')
        .description('Print the JSON Schema for HANDOFF.md frontmatter')
        .option('-o, --output <path>', 'Write schema to a file instead of stdout')
        .action(async (options) => {
        const schemaJson = JSON.stringify(HANDOFF_SCHEMA, null, 2);
        if (options.output) {
            const outputPath = resolve(options.output);
            try {
                await writeFile(outputPath, schemaJson, 'utf-8');
            }
            catch (err) {
                throw new FileError(ErrorCode.FILE_WRITE_ERROR, `Failed to write schema to ${outputPath}: ${err.message}`, { cause: err });
            }
            console.log(`Schema written to ${outputPath}`);
        }
        else {
            console.log(schemaJson);
        }
    });
}
//# sourceMappingURL=schema.js.map