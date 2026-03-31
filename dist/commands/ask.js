import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isTmuxAvailable, listPanes, typeTextAndSubmit, waitForResponse } from '../lib/tmux.js';
import { findAgent, detectAgents, buildPromptWithContext } from '../lib/agents.js';
import { appendQueryLog } from '../lib/logger.js';
import { loadConfig } from '../lib/config.js';
import { TmuxError, AgentError, ErrorCode } from '../lib/errors.js';
export function registerAskCommand(program) {
    program
        .command('ask <agent> <question>')
        .description('Query another agent without leaving current session. Uses tmux to communicate.')
        .option('-t, --timeout <ms>', 'Response wait timeout in milliseconds', '10000')
        .option('--no-context', 'Do not include HANDOFF.md context, just ask the raw question')
        .option('-p, --pane <id>', 'Target a specific pane by ID instead of agent name')
        .action(async (agentName, question, options) => {
        const workingDir = resolve(process.cwd());
        const handoffDir = join(workingDir, '.handoff');
        if (!isTmuxAvailable()) {
            throw new TmuxError(ErrorCode.TMUX_NOT_AVAILABLE, 'tmux is not available. Start a tmux session to use this command.');
        }
        const config = await loadConfig(workingDir);
        const timeoutMs = parseInt(options.timeout, 10) || config.tmux_capture_timeout_ms;
        const panes = listPanes();
        // Find target pane
        let targetPaneId;
        if (options.pane) {
            const pane = panes.find((p) => p.pane_id === options.pane);
            if (!pane) {
                const available = detectAgents(panes).map((a) => `  ${a.name} (pane ${a.pane.pane_id})`).join('\n');
                throw new TmuxError(ErrorCode.TMUX_PANE_NOT_FOUND, `Pane '${options.pane}' not found.` + (available ? `\nAvailable agents:\n${available}` : ''));
            }
            targetPaneId = pane.pane_id;
        }
        else {
            const agent = findAgent(agentName, panes);
            if (!agent) {
                const available = detectAgents(panes).map((a) => `  ${a.name} (pane ${a.pane.pane_id})`).join('\n');
                throw new AgentError(ErrorCode.AGENT_NOT_FOUND, `Agent '${agentName}' not found.` + (available ? `\nAvailable agents:\n${available}` : ''));
            }
            targetPaneId = agent.pane.pane_id;
        }
        // Build prompt
        const prompt = await buildPromptWithContext(question, workingDir, options.context);
        // Send text + Enter atomically in one WSL/tmux call to avoid timing gap
        console.log(`Sending to ${agentName} (pane ${targetPaneId})...`);
        const startMs = Date.now();
        await typeTextAndSubmit(targetPaneId, prompt);
        // Wait for response
        console.log(`Waiting for response (timeout: ${timeoutMs}ms)...`);
        const response = await waitForResponse(targetPaneId, timeoutMs);
        const durationMs = Date.now() - startMs;
        if (!response) {
            console.warn('No response received within timeout.');
        }
        else {
            console.log('\n--- Response ---');
            console.log(response);
            console.log('--- End Response ---\n');
        }
        // Log the query
        const entry = {
            timestamp: new Date().toISOString(),
            agent: agentName,
            question,
            response: response || undefined,
            pane_id: targetPaneId,
            duration_ms: durationMs,
        };
        await appendQueryLog(workingDir, entry);
        // Update session with last query
        try {
            const sessionPath = join(handoffDir, 'session.json');
            const sessionContent = await readFile(sessionPath, 'utf-8');
            const session = JSON.parse(sessionContent);
            session.last_query = entry;
            await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
        }
        catch {
            // No session, skip update
        }
    });
}
//# sourceMappingURL=ask.js.map