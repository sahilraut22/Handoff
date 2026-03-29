/**
 * Agent state tracking for delta exports.
 * Records what each agent has already received so subsequent exports
 * only include new/changed context.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const STATE_FILE = 'agent-state.json';
function hashContent(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
export async function loadAgentState(handoffDir) {
    try {
        const content = await readFile(join(handoffDir, STATE_FILE), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { version: '1.0', agents: {} };
    }
}
export async function saveAgentState(handoffDir, state) {
    await mkdir(handoffDir, { recursive: true });
    await writeFile(join(handoffDir, STATE_FILE), JSON.stringify(state, null, 2), 'utf-8');
}
export function getAgentKnowledge(state, agent) {
    return state.agents[agent] ?? null;
}
export function updateAgentKnowledge(state, agent, changes, decisionIds, context) {
    const fileHashes = {};
    for (const change of changes) {
        if (change.diff) {
            fileHashes[change.path] = hashContent(change.diff);
        }
    }
    state.agents[agent] = {
        lastHandoff: new Date().toISOString(),
        knownDecisions: decisionIds,
        knownFileHashes: fileHashes,
        knownContext: context,
    };
}
export function computeDelta(allChanges, allDecisionIds, agentKnowledge) {
    if (!agentKnowledge) {
        return {
            newChanges: allChanges,
            newDecisions: allDecisionIds,
            unchangedCount: 0,
            isFullHandoff: true,
        };
    }
    const knownHashes = agentKnowledge.knownFileHashes;
    const knownDecisionSet = new Set(agentKnowledge.knownDecisions);
    const newChanges = allChanges.filter((change) => {
        if (!change.diff)
            return true;
        return hashContent(change.diff) !== knownHashes[change.path];
    });
    const newDecisions = allDecisionIds.filter((id) => !knownDecisionSet.has(id));
    return {
        newChanges,
        newDecisions,
        unchangedCount: allChanges.length - newChanges.length,
        isFullHandoff: false,
    };
}
//# sourceMappingURL=agent-state.js.map