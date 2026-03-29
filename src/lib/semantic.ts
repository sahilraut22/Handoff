/**
 * Regex-based semantic analysis of source files.
 * Extracts named entities (functions, classes, interfaces, etc.) and produces
 * human-readable summaries of what changed between two versions of a file.
 * No native dependencies -- pure regex, handles the common 80% of cases.
 */

export type EntityType = 'function' | 'class' | 'interface' | 'type' | 'export' | 'variable' | 'method' | 'struct' | 'trait' | 'contract' | 'event' | 'modifier';

export interface SemanticEntity {
  name: string;
  type: EntityType;
  line: number;
}

export interface SemanticDiff {
  added: SemanticEntity[];
  removed: SemanticEntity[];
  modified: Array<{ entity: SemanticEntity; summary: string }>;
}

// Language patterns: each pattern has a capture group for the entity name
const LANGUAGE_PATTERNS: Record<string, Array<{ pattern: RegExp; type: EntityType }>> = {
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

const EXTENSION_MAP: Record<string, string> = {
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

export function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unknown';
}

export function extractEntities(content: string, language: string): SemanticEntity[] {
  const patterns = LANGUAGE_PATTERNS[language];
  if (!patterns) return [];

  const entities: SemanticEntity[] = [];
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

export function computeSemanticDiff(
  oldContent: string,
  newContent: string,
  filePath: string
): SemanticDiff {
  const language = detectLanguage(filePath);
  const oldEntities = extractEntities(oldContent, language);
  const newEntities = extractEntities(newContent, language);

  const oldNames = new Map(oldEntities.map((e) => [e.name, e]));
  const newNames = new Map(newEntities.map((e) => [e.name, e]));

  const added: SemanticEntity[] = [];
  const removed: SemanticEntity[] = [];
  const modified: Array<{ entity: SemanticEntity; summary: string }> = [];

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

export function formatSemanticSummary(diff: SemanticDiff): string {
  const parts: string[] = [];

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

function groupByType(entities: SemanticEntity[]): Record<string, SemanticEntity[]> {
  const grouped: Record<string, SemanticEntity[]> = {};
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = [];
    grouped[e.type].push(e);
  }
  return grouped;
}

/**
 * Extract names of changed functions/classes from a unified diff string.
 * Looks for function/class declarations near changed lines (+/-).
 */
export function extractChangedNames(diff: string, filePath: string): string[] {
  const language = detectLanguage(filePath);
  const patterns = LANGUAGE_PATTERNS[language];
  if (!patterns) return [];

  const names = new Set<string>();
  const lines = diff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look at added/removed lines and context around hunk headers
    if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@')) continue;

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
