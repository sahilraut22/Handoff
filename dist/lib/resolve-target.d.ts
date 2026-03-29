/**
 * Resolve a target identifier (label, agent name, or pane ID) to a tmux pane ID.
 * Resolution order:
 *   1. Raw pane ID (starts with %)
 *   2. Pane title match (user-assigned label)
 *   3. Agent name match (process detection)
 *   4. Error with list of available panes
 */
export declare function resolveTarget(identifier: string, sessionName?: string): string;
