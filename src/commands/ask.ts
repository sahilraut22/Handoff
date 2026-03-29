import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isTmuxAvailable, listPanes, typeTextAndSubmit, capturePaneLines, waitForResponse } from '../lib/tmux.js';
import { findAgent, detectAgents, buildPromptWithContext } from '../lib/agents.js';
import { appendQueryLog } from '../lib/logger.js';
import { loadConfig } from '../lib/config.js';
import type { Session, QueryLogEntry } from '../types/index.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask <agent> <question>')
    .description('Query another agent without leaving current session. Uses tmux to communicate.')
    .option('-t, --timeout <ms>', 'Response wait timeout in milliseconds', '10000')
    .option('--no-context', 'Do not include HANDOFF.md context, just ask the raw question')
    .option('-p, --pane <id>', 'Target a specific pane by ID instead of agent name')
    .action(async (agentName: string, question: string, options: {
      timeout: string;
      context: boolean;
      pane?: string;
    }) => {
      const workingDir = resolve(process.cwd());
      const handoffDir = join(workingDir, '.handoff');

      if (!isTmuxAvailable()) {
        console.error('tmux is not available. Start a tmux session to use this command.');
        process.exit(1);
      }

      const config = await loadConfig(workingDir);
      const timeoutMs = parseInt(options.timeout, 10) || config.tmux_capture_timeout_ms;

      const panes = listPanes();

      // Find target pane
      let targetPaneId: string;
      if (options.pane) {
        const pane = panes.find((p) => p.pane_id === options.pane);
        if (!pane) {
          console.error(`Pane '${options.pane}' not found.`);
          listAvailablePanes(panes);
          process.exit(1);
        }
        targetPaneId = pane.pane_id;
      } else {
        const agent = findAgent(agentName, panes);
        if (!agent) {
          console.error(`Agent '${agentName}' not found.`);
          listAvailablePanes(panes);
          process.exit(1);
        }
        targetPaneId = agent.pane.pane_id;
      }

      // Build prompt
      const prompt = await buildPromptWithContext(question, workingDir, options.context);

      // Send text + Enter atomically in one WSL/tmux call to avoid timing gap
      console.log(`Sending to ${agentName} (pane ${targetPaneId})...`);
      const startMs = Date.now();
      typeTextAndSubmit(targetPaneId, prompt);

      // Wait for response
      console.log(`Waiting for response (timeout: ${timeoutMs}ms)...`);
      const response = await waitForResponse(targetPaneId, timeoutMs);
      const durationMs = Date.now() - startMs;

      if (!response) {
        console.warn('No response received within timeout.');
      } else {
        console.log('\n--- Response ---');
        console.log(response);
        console.log('--- End Response ---\n');
      }

      // Log the query
      const entry: QueryLogEntry = {
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
        const session = JSON.parse(sessionContent) as Session;
        session.last_query = entry;
        await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
      } catch {
        // No session, skip update
      }
    });
}

function listAvailablePanes(panes: ReturnType<typeof listPanes>): void {
  const agents = detectAgents(panes);
  if (agents.length > 0) {
    console.error('\nAvailable agents:');
    for (const a of agents) {
      console.error(`  ${a.name} (pane ${a.pane.pane_id})`);
    }
  } else {
    console.error('\nNo agents detected. Use `handoff list` to see all panes.');
    console.error('Use `handoff name <label>` to label a pane, then reference it by label.');
  }
}
