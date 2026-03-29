/**
 * Interoperability layer: generate output in formats compatible with
 * other agent memory files (CLAUDE.md, AGENTS.md) or structured JSON.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDuration } from './markdown.js';
const KNOWN_MEMORY_FILES = [
    { agent: 'claude', file: 'CLAUDE.md' },
    { agent: 'agents', file: 'AGENTS.md' },
    { agent: 'gemini', file: 'GEMINI.md' },
    { agent: 'cursor', file: '.cursorrules' },
    { agent: 'copilot', file: '.github/copilot-instructions.md' },
    { agent: 'aider', file: '.aider.conf.yml' },
];
/**
 * Detect which agent memory files exist in a directory.
 */
export async function detectMemoryFiles(dir) {
    const found = [];
    for (const { agent, file } of KNOWN_MEMORY_FILES) {
        try {
            const fullPath = join(dir, file);
            await readFile(fullPath, 'utf-8');
            found.push({ agent, file, path: fullPath });
        }
        catch {
            // Not found
        }
    }
    return found;
}
/**
 * Read and merge context from multiple agent memory files.
 */
export async function loadAgentMemory(dir, files) {
    const result = {};
    for (const file of files) {
        try {
            result[file] = await readFile(join(dir, file), 'utf-8');
        }
        catch {
            // Skip missing files
        }
    }
    return result;
}
/**
 * Generate a CLAUDE.md compatible snippet from handoff context.
 * This can be prepended to an existing CLAUDE.md.
 */
export function generateClaudeMdSnippet(context) {
    const { session, changes, message } = context;
    const duration = formatDuration(session.created_at);
    const modified = changes.filter((c) => c.type === 'modified').length;
    const added = changes.filter((c) => c.type === 'added').length;
    const deleted = changes.filter((c) => c.type === 'deleted').length;
    const lines = [];
    lines.push('## Recent Session Context');
    lines.push('');
    lines.push(`> This context was transferred from a previous session (${duration}) via handoff.`);
    lines.push('');
    lines.push(`**Session:** ${session.session_id.slice(0, 8)}`);
    lines.push(`**Changes:** ${modified} modified, ${added} added, ${deleted} deleted`);
    if (message) {
        lines.push('');
        lines.push(`**Summary:** ${message}`);
    }
    if (changes.length > 0) {
        lines.push('');
        lines.push('**Key files changed:**');
        for (const change of changes.slice(0, 10)) {
            lines.push(`- \`${change.path}\` (${change.type})`);
        }
        if (changes.length > 10) {
            lines.push(`- ... and ${changes.length - 10} more`);
        }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
}
/**
 * Generate an AGENTS.md compatible section from handoff context.
 */
export function generateAgentsMdSection(context) {
    const { session, changes, message } = context;
    const duration = formatDuration(session.created_at);
    const lines = [];
    lines.push('## Handoff Context');
    lines.push('');
    lines.push(`Session transferred after ${duration} of work.`);
    if (message) {
        lines.push('');
        lines.push(message);
    }
    lines.push('');
    lines.push('### Modified files');
    lines.push('');
    const withChanges = changes.filter((c) => c.type !== 'deleted');
    if (withChanges.length === 0) {
        lines.push('None');
    }
    else {
        for (const change of withChanges.slice(0, 15)) {
            lines.push(`- \`${change.path}\``);
        }
    }
    lines.push('');
    return lines.join('\n');
}
/**
 * Generate structured JSON output from handoff context.
 */
export function generateJsonOutput(context) {
    const { session, changes, message, compression_result, decisions } = context;
    const output = {
        handoff_version: '2.0',
        session: {
            id: session.session_id,
            created_at: session.created_at,
            working_dir: session.working_dir,
            agent: session.agent_name,
        },
        message: message ?? null,
        changes: changes.map((c) => ({
            path: c.path,
            type: c.type,
            lines_added: c.linesAdded ?? 0,
            lines_removed: c.linesRemoved ?? 0,
            is_binary: c.isBinary ?? false,
        })),
        compression: compression_result
            ? {
                total: compression_result.stats.total_changes,
                included: compression_result.stats.included_changes,
                omitted: compression_result.stats.omitted_changes,
                tokens_used: compression_result.stats.estimated_tokens,
            }
            : null,
        decisions: decisions ?? [],
        generated_at: new Date().toISOString(),
    };
    return JSON.stringify(output, null, 2);
}
/**
 * Main dispatch for interop output formats.
 */
export function generateInteropOutput(context, format) {
    switch (format) {
        case 'json':
            return generateJsonOutput(context);
        case 'claude':
            return generateClaudeMdSnippet(context);
        case 'agents':
            return generateAgentsMdSection(context);
    }
}
//# sourceMappingURL=interop.js.map