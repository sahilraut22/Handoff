import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { serializeDecision, parseDecision } from './yaml-lite.js';
const DECISIONS_DIR = '.handoff/decisions';
export function generateDecisionId() {
    // 8-char base36 ID from timestamp + random bytes
    const tsBase = Date.now().toString(36).slice(-4);
    const randBase = randomBytes(3).toString('hex').slice(0, 4);
    return tsBase + randBase;
}
function decisionsDir(workingDir) {
    return join(workingDir, DECISIONS_DIR);
}
export async function saveDecision(workingDir, decision) {
    const dir = decisionsDir(workingDir);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${decision.id}.yaml`);
    await writeFile(filePath, serializeDecision(decision), 'utf-8');
    return filePath;
}
export async function loadDecision(workingDir, id) {
    const filePath = join(decisionsDir(workingDir), `${id}.yaml`);
    const content = await readFile(filePath, 'utf-8');
    return parseDecision(content);
}
export async function loadAllDecisions(workingDir) {
    const dir = decisionsDir(workingDir);
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch {
        return [];
    }
    const decisions = [];
    for (const entry of entries.filter((e) => e.endsWith('.yaml'))) {
        try {
            const content = await readFile(join(dir, entry), 'utf-8');
            decisions.push(parseDecision(content));
        }
        catch {
            // Skip malformed files
        }
    }
    return decisions.sort((a, b) => a.date.localeCompare(b.date));
}
export async function searchDecisions(workingDir, query) {
    const all = await loadAllDecisions(workingDir);
    const lower = query.toLowerCase();
    return all.filter((d) => d.title.toLowerCase().includes(lower) ||
        d.context.toLowerCase().includes(lower) ||
        d.decision.toLowerCase().includes(lower) ||
        d.tags?.some((t) => t.toLowerCase().includes(lower)) ||
        d.consequences?.toLowerCase().includes(lower));
}
export async function updateDecisionStatus(workingDir, id, status) {
    const decision = await loadDecision(workingDir, id);
    decision.status = status;
    await saveDecision(workingDir, decision);
}
export function formatDecisionMarkdown(d) {
    const lines = [];
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
export function formatDecisionsTable(decisions) {
    if (decisions.length === 0)
        return 'No decisions recorded.';
    const header = '| ID | Title | Status | Date | Tags |';
    const divider = '|----|-------|--------|------|------|';
    const rows = decisions.map((d) => {
        const tags = d.tags && d.tags.length > 0 ? d.tags.join(', ') : '-';
        const title = d.title.length > 50 ? d.title.slice(0, 47) + '...' : d.title;
        return `| \`${d.id}\` | ${title} | ${d.status} | ${d.date.slice(0, 10)} | ${tags} |`;
    });
    return [header, divider, ...rows].join('\n');
}
//# sourceMappingURL=decisions.js.map