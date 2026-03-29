import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const AGENT_REGISTRY = {
    claude: {
        name: 'claude',
        command: 'claude',
        processName: 'claude',
        memoryFile: 'CLAUDE.md',
        exitCommand: '/exit',
    },
    codex: {
        name: 'codex',
        command: 'codex',
        processName: 'codex',
    },
    gemini: {
        name: 'gemini',
        command: 'gemini',
        processName: 'gemini',
        memoryFile: 'GEMINI.md',
    },
    aider: {
        name: 'aider',
        command: 'aider',
        processName: 'aider',
        exitCommand: '/exit',
    },
    cursor: {
        name: 'cursor',
        command: 'cursor',
        processName: 'cursor',
        memoryFile: '.cursorrules',
    },
    copilot: {
        name: 'copilot',
        command: 'gh copilot',
        processName: 'gh',
    },
};
// Derived from registry for backward compatibility
const AGENT_PROCESS_MAP = Object.fromEntries(Object.entries(AGENT_REGISTRY).map(([name, config]) => [name, [config.processName]]));
export function getAgentConfig(name, customAgents) {
    // Check custom agents first, merged with registry defaults
    if (customAgents && name in customAgents) {
        const custom = customAgents[name];
        const base = AGENT_REGISTRY[name];
        if (base) {
            return { ...base, ...custom };
        }
        // Custom-only agent - must have at least command and processName
        if (custom.command && custom.processName) {
            return {
                name,
                command: custom.command,
                processName: custom.processName,
                memoryFile: custom.memoryFile,
                exitCommand: custom.exitCommand,
            };
        }
    }
    return AGENT_REGISTRY[name];
}
export function listKnownAgents(customAgents) {
    const names = new Set([
        ...Object.keys(AGENT_REGISTRY),
        ...Object.keys(customAgents ?? {}),
    ]);
    return [...names].sort();
}
function matchesAgent(pane) {
    const cmd = pane.pane_current_command.toLowerCase();
    for (const [agentName, processes] of Object.entries(AGENT_PROCESS_MAP)) {
        if (processes.some((p) => cmd === p || cmd.endsWith(`/${p}`) || cmd.endsWith(`\\${p}`))) {
            return agentName;
        }
    }
    return undefined;
}
export function detectAgents(panes) {
    const agents = [];
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
export function findAgent(name, panes) {
    // 1. Exact match on pane title (user-assigned label)
    const byLabel = panes.find((p) => p.pane_title === name);
    if (byLabel) {
        return { name, pane: byLabel, label: byLabel.pane_title };
    }
    // 2. Match by agent name (process detection)
    const agents = detectAgents(panes);
    const byAgent = agents.find((a) => a.name === name);
    if (byAgent)
        return byAgent;
    // 3. Match by pane ID directly
    const byPaneId = panes.find((p) => p.pane_id === name);
    if (byPaneId) {
        return { name, pane: byPaneId };
    }
    return undefined;
}
export async function buildPromptWithContext(question, workingDir, includeContext) {
    if (!includeContext)
        return question;
    try {
        const handoffPath = join(workingDir, 'HANDOFF.md');
        const context = await readFile(handoffPath, 'utf-8');
        const maxContextLength = 8000;
        const truncated = context.length > maxContextLength
            ? context.slice(0, maxContextLength) + '\n\n[HANDOFF.md truncated]'
            : context;
        return `Context from HANDOFF.md:\n\n${truncated}\n\n---\n\nQuestion: ${question}`;
    }
    catch {
        return question;
    }
}
//# sourceMappingURL=agents.js.map