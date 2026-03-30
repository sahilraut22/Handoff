import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { serializeDecision, parseDecision } from './yaml-lite.js';
import type { Decision, DecisionStatus, ExtractedDecision } from '../types/index.js';

const DECISIONS_DIR = '.handoff/decisions';

export function generateDecisionId(): string {
  // 8-char base36 ID from timestamp + random bytes
  const tsBase = Date.now().toString(36).slice(-4);
  const randBase = randomBytes(3).toString('hex').slice(0, 4);
  return tsBase + randBase;
}

function decisionsDir(workingDir: string): string {
  return join(workingDir, DECISIONS_DIR);
}

export async function saveDecision(workingDir: string, decision: Decision): Promise<string> {
  const dir = decisionsDir(workingDir);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${decision.id}.yaml`);
  await writeFile(filePath, serializeDecision(decision), 'utf-8');
  return filePath;
}

export async function loadDecision(workingDir: string, id: string): Promise<Decision> {
  const filePath = join(decisionsDir(workingDir), `${id}.yaml`);
  const content = await readFile(filePath, 'utf-8');
  return parseDecision(content);
}

export async function loadAllDecisions(workingDir: string): Promise<Decision[]> {
  const dir = decisionsDir(workingDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const decisions: Decision[] = [];
  for (const entry of entries.filter((e) => e.endsWith('.yaml'))) {
    try {
      const content = await readFile(join(dir, entry), 'utf-8');
      decisions.push(parseDecision(content));
    } catch {
      // Skip malformed files
    }
  }

  return decisions.sort((a, b) => a.date.localeCompare(b.date));
}

export async function searchDecisions(workingDir: string, query: string): Promise<Decision[]> {
  const all = await loadAllDecisions(workingDir);
  const lower = query.toLowerCase();
  return all.filter(
    (d) =>
      d.title.toLowerCase().includes(lower) ||
      d.context.toLowerCase().includes(lower) ||
      d.decision.toLowerCase().includes(lower) ||
      d.tags?.some((t) => t.toLowerCase().includes(lower)) ||
      d.consequences?.toLowerCase().includes(lower)
  );
}

export async function updateDecisionStatus(
  workingDir: string,
  id: string,
  status: DecisionStatus
): Promise<void> {
  const decision = await loadDecision(workingDir, id);
  decision.status = status;
  await saveDecision(workingDir, decision);
}

export function formatDecisionMarkdown(d: Decision): string {
  const lines: string[] = [];
  lines.push(`### [${d.id}] ${d.title}`);
  lines.push('');
  lines.push(`**Status:** ${d.status} | **Date:** ${d.date.slice(0, 10)}${d.agent ? ` | **Agent:** ${d.agent}` : ''}`);
  if (d.tags && d.tags.length > 0) {
    lines.push(`**Tags:** ${d.tags.map((t) => `\`${t}\``).join(', ')}`);
  }
  lines.push('');
  lines.push('**Context:**');
  lines.push(d.context);
  lines.push('');
  lines.push('**Decision:**');
  lines.push(d.decision);
  if (d.alternatives && d.alternatives.length > 0) {
    lines.push('');
    lines.push('**Alternatives considered:**');
    for (const alt of d.alternatives) {
      lines.push(`- ${alt}`);
    }
  }
  if (d.consequences) {
    lines.push('');
    lines.push('**Consequences:**');
    lines.push(d.consequences);
  }
  if (d.supersedes) {
    lines.push('');
    lines.push(`*Supersedes decision \`${d.supersedes}\`*`);
  }
  return lines.join('\n');
}

export async function saveExtractedDecisions(
  workingDir: string,
  extracted: ExtractedDecision[],
  minConfidence = 0.6
): Promise<string[]> {
  const eligible = extracted.filter((d) => d.confidence >= minConfidence);
  if (eligible.length === 0) return [];

  const existing = await loadAllDecisions(workingDir);
  const existingTitles = existing.map((d) => d.title);

  const savedIds: string[] = [];
  for (const e of eligible) {
    // Simple dedup: skip if very similar title already exists
    const similar = existingTitles.some((t) => {
      const tLower = t.toLowerCase();
      const eLower = e.title.toLowerCase();
      return tLower.includes(eLower.slice(0, 30)) || eLower.includes(tLower.slice(0, 30));
    });
    if (similar) continue;

    const decision: Decision = {
      id: generateDecisionId(),
      title: e.title,
      status: 'proposed',
      date: new Date().toISOString(),
      context: e.context,
      decision: e.decision,
      alternatives: e.alternatives.length > 0 ? e.alternatives : undefined,
      tags: e.tags.length > 0 ? e.tags : undefined,
      confidence: e.confidence,
      source: e.source,
      source_location: e.source_location,
      auto_extracted: true,
    };

    await saveDecision(workingDir, decision);
    savedIds.push(decision.id);
    existingTitles.push(decision.title);
  }

  return savedIds;
}

export async function reviewPendingDecisions(workingDir: string): Promise<Decision[]> {
  const all = await loadAllDecisions(workingDir);
  return all.filter((d) => d.status === 'proposed' && d.auto_extracted === true);
}

export function formatDecisionsTable(decisions: Decision[]): string {
  if (decisions.length === 0) return 'No decisions recorded.';

  const header = '| ID | Title | Status | Date | Tags |';
  const divider = '|----|-------|--------|------|------|';
  const rows = decisions.map((d) => {
    const tags = d.tags && d.tags.length > 0 ? d.tags.join(', ') : '-';
    const title = d.title.length > 50 ? d.title.slice(0, 47) + '...' : d.title;
    return `| \`${d.id}\` | ${title} | ${d.status} | ${d.date.slice(0, 10)} | ${tags} |`;
  });

  return [header, divider, ...rows].join('\n');
}
