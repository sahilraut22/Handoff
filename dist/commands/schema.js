import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HANDOFF_SCHEMA } from '../lib/schema.js';
export function registerSchemaCommand(program) {
    program
        .command('schema')
        .description('Print the JSON Schema for HANDOFF.md frontmatter')
        .option('-o, --output <path>', 'Write schema to a file instead of stdout')
        .action(async (options) => {
        const schemaJson = JSON.stringify(HANDOFF_SCHEMA, null, 2);
        if (options.output) {
            const outputPath = resolve(options.output);
            await writeFile(outputPath, schemaJson, 'utf-8');
            console.log(`Schema written to ${outputPath}`);
        }
        else {
            console.log(schemaJson);
        }
    });
}
//# sourceMappingURL=schema.js.map