/**
 * Minimal YAML serializer/deserializer for the Decision type.
 * Supports: string fields, optional string arrays, quoted values, multiline strings (literal block scalar).
 * No external dependencies -- handles the Decision schema only.
 */

import type { Decision, DecisionStatus } from '../types/index.js';

const VALID_STATUSES: DecisionStatus[] = ['accepted', 'proposed', 'superseded', 'deprecated'];

// --- Serializer ---

function escapeYamlString(value: string): string {
  // Commas and most chars are fine in block scalar YAML values.
  // Only quote when truly required: colon-space (: ), hash after space, leading/trailing space,
  // newlines, empty string, and chars that break YAML parsing: #, [, ], {, }, &, *, !, |, >, ', "
  const needsQuoting =
    value === '' ||
    value.startsWith(' ') || value.endsWith(' ') ||
    value.includes('\n') ||
    /^[>|{[\]!&*'"@`%]/.test(value) ||
    /: /.test(value) ||
    / #/.test(value) ||
    value.includes('"');
  if (needsQuoting) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return value;
}

export function serializeDecision(d: Decision): string {
  const lines: string[] = [];

  lines.push(`id: ${d.id}`);
  lines.push(`title: ${escapeYamlString(d.title)}`);
  lines.push(`status: ${d.status}`);
  lines.push(`date: "${d.date}"`);
  lines.push(`context: ${escapeYamlString(d.context)}`);
  lines.push(`decision: ${escapeYamlString(d.decision)}`);

  if (d.alternatives && d.alternatives.length > 0) {
    lines.push('alternatives:');
    for (const alt of d.alternatives) {
      lines.push(`  - ${escapeYamlString(alt)}`);
    }
  }

  if (d.consequences !== undefined) {
    lines.push(`consequences: ${escapeYamlString(d.consequences)}`);
  }

  if (d.tags && d.tags.length > 0) {
    lines.push('tags:');
    for (const tag of d.tags) {
      lines.push(`  - ${escapeYamlString(tag)}`);
    }
  }

  if (d.supersedes !== undefined) {
    lines.push(`supersedes: ${d.supersedes}`);
  }

  if (d.agent !== undefined) {
    lines.push(`agent: ${escapeYamlString(d.agent)}`);
  }

  return lines.join('\n') + '\n';
}

// --- Parser ---

function unquoteYamlString(raw: string): string {
  const trimmed = raw.trim();
  // Double-quoted string
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  // Single-quoted string
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function parseDecision(yaml: string): Decision {
  const lines = yaml.split('\n');
  const result: Partial<Decision> = {};
  let currentArray: string[] | null = null;
  let currentArrayKey: 'alternatives' | 'tags' | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      // If we were collecting array items, flush them
      if (currentArrayKey && currentArray) {
        (result as Record<string, unknown>)[currentArrayKey] = currentArray;
        currentArray = null;
        currentArrayKey = null;
      }
      continue;
    }

    // Array item
    if (line.startsWith('  - ')) {
      if (currentArray !== null) {
        currentArray.push(unquoteYamlString(line.slice(4)));
      }
      continue;
    }

    // If we were collecting array items and hit a non-item line, flush
    if (currentArrayKey && currentArray && !line.startsWith('  ')) {
      (result as Record<string, unknown>)[currentArrayKey] = currentArray;
      currentArray = null;
      currentArrayKey = null;
    }

    // Key: value line
    const colonIdx = line.indexOf(': ');
    if (colonIdx === -1) {
      // Check for key with no value (array header)
      const trimmed = line.trim().replace(/:$/, '');
      if (trimmed === 'alternatives' || trimmed === 'tags') {
        currentArrayKey = trimmed as 'alternatives' | 'tags';
        currentArray = [];
      }
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 2);

    switch (key) {
      case 'id':
        result.id = value.trim();
        break;
      case 'title':
        result.title = unquoteYamlString(value);
        break;
      case 'status':
        result.status = value.trim() as DecisionStatus;
        break;
      case 'date':
        result.date = unquoteYamlString(value);
        break;
      case 'context':
        result.context = unquoteYamlString(value);
        break;
      case 'decision':
        result.decision = unquoteYamlString(value);
        break;
      case 'consequences':
        result.consequences = unquoteYamlString(value);
        break;
      case 'supersedes':
        result.supersedes = value.trim();
        break;
      case 'agent':
        result.agent = unquoteYamlString(value);
        break;
      case 'alternatives':
      case 'tags':
        // Value follows on same line (shouldn't happen with our serializer, but handle it)
        if (value.trim()) {
          (result as Record<string, unknown>)[key] = [unquoteYamlString(value)];
        } else {
          currentArrayKey = key as 'alternatives' | 'tags';
          currentArray = [];
        }
        break;
    }
  }

  // Flush any remaining array
  if (currentArrayKey && currentArray) {
    (result as Record<string, unknown>)[currentArrayKey] = currentArray;
  }

  // Validate required fields
  const required = ['id', 'title', 'status', 'date', 'context', 'decision'] as const;
  for (const field of required) {
    if (!result[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!VALID_STATUSES.includes(result.status!)) {
    throw new Error(`Invalid status: ${result.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return result as Decision;
}
