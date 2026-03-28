import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TmuxPane, DetectedAgent } from '../types/index.js';

const AGENT_PROCESS_MAP: Record<string, string[]> = {
  claude: ['claude'],
  codex: ['codex'],
  gemini: ['gemini'],
  aider: ['aider'],
  cursor: ['cursor'],
  copilot: ['gh'],
};

function matchesAgent(pane: TmuxPane): string | undefined {
  const cmd = pane.pane_current_command.toLowerCase();
  for (const [agentName, processes] of Object.entries(AGENT_PROCESS_MAP)) {
    if (processes.some((p) => cmd === p || cmd.endsWith(`/${p}`) || cmd.endsWith(`\\${p}`))) {
      return agentName;
    }
  }
  return undefined;
}

export function detectAgents(panes: TmuxPane[]): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  for (const pane of panes) {
    const agentName = matchesAgent(pane);
    if (agentName) {
      agents.push({
        name: agentName,
        pane,
        label: pane.pane_title || undefined,
      });
    }
  }
  return agents;
}

export function findAgent(name: string, panes: TmuxPane[]): DetectedAgent | undefined {
  // 1. Exact match on pane title (user-assigned label)
  const byLabel = panes.find((p) => p.pane_title === name);
  if (byLabel) {
    return { name, pane: byLabel, label: byLabel.pane_title };
  }

  // 2. Match by agent name (process detection)
  const agents = detectAgents(panes);
  const byAgent = agents.find((a) => a.name === name);
  if (byAgent) return byAgent;

  // 3. Match by pane ID directly
  const byPaneId = panes.find((p) => p.pane_id === name);
  if (byPaneId) {
    return { name, pane: byPaneId };
  }

  return undefined;
}

export async function buildPromptWithContext(
  question: string,
  workingDir: string,
  includeContext: boolean
): Promise<string> {
  if (!includeContext) return question;

  try {
    const handoffPath = join(workingDir, 'HANDOFF.md');
    const context = await readFile(handoffPath, 'utf-8');
    // Truncate context to avoid overwhelming the agent
    const maxContextLength = 8000;
    const truncated = context.length > maxContextLength
      ? context.slice(0, maxContextLength) + '\n\n[HANDOFF.md truncated]'
      : context;
    return `Context from HANDOFF.md:\n\n${truncated}\n\n---\n\nQuestion: ${question}`;
  } catch {
    // No HANDOFF.md, just ask the question
    return question;
  }
}
