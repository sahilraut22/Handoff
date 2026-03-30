/**
 * Regex-based semantic analysis of source files.
 * Extracts named entities (functions, classes, interfaces, etc.) and produces
 * human-readable summaries of what changed between two versions of a file.
 * No native dependencies -- pure regex, handles the common 80% of cases.
 */
// Language patterns: each pattern has a capture group for the entity name
const LANGUAGE_PATTERNS = {
    typescript: [
        { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, type: 'function' },
        { pattern: /^(?:export\s+)?class\s+(\w+)/m, type: 'class' },
        { pattern: /^(?:export\s+)?interface\s+(\w+)/m, type: 'interface' },
        { pattern: /^(?:export\s+)?type\s+(\w+)\s*=/m, type: 'type' },
        { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\S+\s*)?=\s*(?:async\s*)?\(?.*?\)?\s*=>/m, type: 'function' },
        { pattern: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?[{:]/m, type: 'method' },
    ],
    javascript: [
        { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, type: 'function' },
        { pattern: /^(?:export\s+)?class\s+(\w+)/m, type: 'class' },
        { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(?.*?\)?\s*=>/m, type: 'function' },
        { pattern: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/m, type: 'method' },
    ],
    python: [
        { pattern: /^def\s+(\w+)/m, type: 'function' },
        { pattern: /^class\s+(\w+)/m, type: 'class' },
        { pattern: /^\s+def\s+(\w+)/m, type: 'method' },
    ],
    go: [
        { pattern: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/m, type: 'function' },
        { pattern: /^type\s+(\w+)\s+struct/m, type: 'struct' },
        { pattern: /^type\s+(\w+)\s+interface/m, type: 'interface' },
        { pattern: /^type\s+(\w+)\s+/m, type: 'type' },
    ],
    rust: [
        { pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/m, type: 'function' },
        { pattern: /^(?:pub\s+)?struct\s+(\w+)/m, type: 'struct' },
        { pattern: /^(?:pub\s+)?trait\s+(\w+)/m, type: 'trait' },
        { pattern: /^(?:pub\s+)?enum\s+(\w+)/m, type: 'type' },
        { pattern: /^impl\s+(?:\w+\s+for\s+)?(\w+)/m, type: 'class' },
    ],
    solidity: [
        { pattern: /^\s+function\s+(\w+)/m, type: 'function' },
        { pattern: /^contract\s+(\w+)/m, type: 'contract' },
        { pattern: /^interface\s+(\w+)/m, type: 'interface' },
        { pattern: /^\s+event\s+(\w+)/m, type: 'event' },
        { pattern: /^\s+modifier\s+(\w+)/m, type: 'modifier' },
    ],
};
const EXTENSION_MAP = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.sol': 'solidity',
};
export function detectLanguage(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    return EXTENSION_MAP[ext] ?? 'unknown';
}
export function extractEntities(content, language) {
    const patterns = LANGUAGE_PATTERNS[language];
    if (!patterns)
        return [];
    const entities = [];
    const lines = content.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        for (const { pattern, type } of patterns) {
            // Match against current line only -- avoids false positives from lookahead
            const match = line.match(pattern);
            if (match && match[1] && match[1].length > 1) {
                // Avoid duplicates at same line
                if (!entities.some((e) => e.name === match[1] && e.line === lineIdx + 1)) {
                    entities.push({ name: match[1], type, line: lineIdx + 1 });
                }
                break; // Only one pattern match per line
            }
        }
    }
    return entities;
}
export function computeSemanticDiff(oldContent, newContent, filePath) {
    const language = detectLanguage(filePath);
    const oldEntities = extractEntities(oldContent, language);
    const newEntities = extractEntities(newContent, language);
    const oldNames = new Map(oldEntities.map((e) => [e.name, e]));
    const newNames = new Map(newEntities.map((e) => [e.name, e]));
    const added = [];
    const removed = [];
    const modified = [];
    // Removed: in old but not in new
    for (const [name, entity] of oldNames) {
        if (!newNames.has(name)) {
            removed.push(entity);
        }
    }
    // Added: in new but not in old
    for (const [name, entity] of newNames) {
        if (!oldNames.has(name)) {
            added.push(entity);
        }
    }
    // Modified: in both but at different lines (heuristic for changes)
    for (const [name, newEntity] of newNames) {
        const oldEntity = oldNames.get(name);
        if (oldEntity && oldEntity.line !== newEntity.line) {
            modified.push({
                entity: newEntity,
                summary: `${newEntity.type} \`${name}\` moved/modified (was line ${oldEntity.line}, now line ${newEntity.line})`,
            });
        }
    }
    return { added, removed, modified };
}
export function formatSemanticSummary(diff) {
    const parts = [];
    if (diff.added.length > 0) {
        const grouped = groupByType(diff.added);
        for (const [type, entities] of Object.entries(grouped)) {
            const names = entities.map((e) => `\`${e.name}\``).join(', ');
            parts.push(`Added ${type}${entities.length > 1 ? 's' : ''} ${names}`);
        }
    }
    if (diff.removed.length > 0) {
        const grouped = groupByType(diff.removed);
        for (const [type, entities] of Object.entries(grouped)) {
            const names = entities.map((e) => `\`${e.name}\``).join(', ');
            parts.push(`Removed ${type}${entities.length > 1 ? 's' : ''} ${names}`);
        }
    }
    if (diff.modified.length > 0) {
        const names = diff.modified.map((m) => `\`${m.entity.name}\``).join(', ');
        parts.push(`Modified ${names}`);
    }
    return parts.join('; ') || 'No structural changes detected';
}
function groupByType(entities) {
    const grouped = {};
    for (const e of entities) {
        if (!grouped[e.type])
            grouped[e.type] = [];
        grouped[e.type].push(e);
    }
    return grouped;
}
/**
 * Extract names of changed functions/classes from a unified diff string.
 * Looks for function/class declarations near changed lines (+/-).
 */
export function extractChangedNames(diff, filePath) {
    const language = detectLanguage(filePath);
    const patterns = LANGUAGE_PATTERNS[language];
    if (!patterns)
        return [];
    const names = new Set();
    const lines = diff.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look at added/removed lines and context around hunk headers
        if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@'))
            continue;
        const content = line.startsWith('+') || line.startsWith('-') ? line.slice(1) : line;
        const lookahead = [content, lines[i + 1] ?? '', lines[i + 2] ?? ''].join('\n');
        for (const { pattern } of patterns) {
            const match = lookahead.match(pattern);
            if (match && match[1] && match[1].length > 1) {
                names.add(match[1]);
                break;
            }
        }
    }
    return Array.from(names);
}
/**
 * Extract entities with their full line ranges (start to closing brace / end of block).
 * Used by semantic-chunker.ts to produce function-level diff chunks.
 */
export function extractEntityRanges(content, language) {
    const entities = extractEntities(content, language);
    if (entities.length === 0)
        return [];
    const lines = content.split('\n');
    const ranges = [];
    for (const entity of entities) {
        const startLine = entity.line - 1; // convert to 0-indexed
        // For Python: use indentation to determine block end
        if (language === 'python') {
            const declarationIndent = (lines[startLine]?.match(/^(\s*)/) ?? ['', ''])[1].length;
            let endLine = startLine;
            for (let i = startLine + 1; i < lines.length; i++) {
                const line = lines[i] ?? '';
                if (line.trim() === '')
                    continue; // blank lines allowed inside block
                const indent = (line.match(/^(\s*)/) ?? ['', ''])[1].length;
                if (indent <= declarationIndent)
                    break;
                endLine = i;
            }
            ranges.push({ entity, start_line: startLine, end_line: endLine });
            continue;
        }
        // For brace-based languages: count { } to find matching close
        let depth = 0;
        let foundOpen = false;
        let endLine = startLine;
        for (let i = startLine; i < Math.min(startLine + 300, lines.length); i++) {
            const line = lines[i] ?? '';
            for (const ch of line) {
                if (ch === '{') {
                    depth++;
                    foundOpen = true;
                }
                else if (ch === '}') {
                    depth--;
                    if (foundOpen && depth <= 0) {
                        endLine = i;
                        break;
                    }
                }
            }
            if (foundOpen && depth <= 0)
                break;
        }
        // If no braces found (e.g., type alias), end at next blank line
        if (!foundOpen) {
            for (let i = startLine + 1; i < lines.length; i++) {
                if ((lines[i] ?? '').trim() === '')
                    break;
                endLine = i;
            }
        }
        ranges.push({ entity, start_line: startLine, end_line: Math.max(startLine, endLine) });
    }
    return ranges;
}
//# sourceMappingURL=semantic.js.map