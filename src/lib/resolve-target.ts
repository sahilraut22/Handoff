import { getSessionPanes } from './tmux.js';
import { findAgent } from './agents.js';

const DEFAULT_SESSION = 'handoff';

/**
 * Resolve a target identifier (label, agent name, or pane ID) to a tmux pane ID.
 * Resolution order:
 *   1. Raw pane ID (starts with %)
 *   2. Pane title match (user-assigned label)
 *   3. Agent name match (process detection)
 *   4. Error with list of available panes
 */
export function resolveTarget(identifier: string, sessionName?: string): string {
  const session = sessionName ?? DEFAULT_SESSION;
  const panes = getSessionPanes(session);

  // Fall back to all panes if session-specific lookup fails
  const allPanes = panes.length > 0 ? panes : [];

  // 1. Raw pane ID
  if (identifier.startsWith('%')) {
    const found = allPanes.find((p) => p.pane_id === identifier);
    if (found) return found.pane_id;
    throw new Error(`Pane '${identifier}' not found in session '${session}'.`);
  }

  // 2. Pane title (label) match
  const byTitle = allPanes.find((p) => p.pane_title === identifier);
  if (byTitle) return byTitle.pane_id;

  // 3. Agent name match
  const agent = findAgent(identifier, allPanes);
  if (agent) return agent.pane.pane_id;

  // 4. Not found - provide helpful error
  const available = allPanes
    .map((p) => {
      const label = p.pane_title ? ` (${p.pane_title})` : '';
      return `  ${p.pane_id}${label} [${p.pane_current_command}]`;
    })
    .join('\n');

  throw new Error(
    `Target '${identifier}' not found in session '${session}'.\n` +
    (available ? `Available panes:\n${available}` : 'No panes found in session.')
  );
}
