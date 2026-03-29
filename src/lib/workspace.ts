import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceState, HandoffConfig } from '../types/index.js';
import {
  hasSession,
  newSession,
  splitPane,
  killPane,
  killSession,
  selectPane,
  selectLayout,
  attachSession,
  getSessionPanes,
  resizePane,
  setPaneTitle,
  sendKeys,
  sourceConfig,
} from './tmux.js';
import { getAgentConfig } from './agents.js';

const DEFAULT_SESSION_NAME = 'handoff';
const CONTROL_PANE_LABEL = 'control';
const CONTROL_PANE_HEIGHT = 8;

export async function loadWorkspaceState(workingDir: string): Promise<WorkspaceState | null> {
  try {
    const content = await readFile(join(workingDir, '.handoff', 'workspace.json'), 'utf-8');
    return JSON.parse(content) as WorkspaceState;
  } catch {
    return null;
  }
}

export async function saveWorkspaceState(workingDir: string, state: WorkspaceState): Promise<void> {
  await mkdir(join(workingDir, '.handoff'), { recursive: true });
  await writeFile(
    join(workingDir, '.handoff', 'workspace.json'),
    JSON.stringify(state, null, 2),
    'utf-8'
  );
}

function resolveAgentCommand(agentName: string, config: HandoffConfig): string {
  const agentConfig = getAgentConfig(agentName, config.agents);
  return agentConfig?.command ?? agentName;
}

function pickLayout(agentCount: number): string {
  if (agentCount >= 3) return 'tiled';
  if (agentCount === 2) return 'even-horizontal';
  return 'even-horizontal';
}

export async function createWorkspace(
  agents: string[],
  workingDir: string,
  config: HandoffConfig,
  options?: { sessionName?: string; tmuxConfigPath?: string }
): Promise<void> {
  const sessionName = options?.sessionName ?? DEFAULT_SESSION_NAME;

  if (hasSession(sessionName)) {
    throw new Error(`Session '${sessionName}' already exists. Use 'handoff attach' to reconnect or 'handoff kill --force' to destroy it.`);
  }

  // Create detached session, capture first pane ID
  const firstPaneId = newSession(sessionName, { detached: true, startDir: workingDir });

  // Load tmux config into the running server
  if (options?.tmuxConfigPath) {
    sourceConfig(options.tmuxConfigPath);
  }

  const state: WorkspaceState = {
    session_name: sessionName,
    created_at: new Date().toISOString(),
    working_dir: workingDir,
    panes: [],
  };

  if (agents.length === 0) {
    // No agents - just a control pane
    setPaneTitle(CONTROL_PANE_LABEL, firstPaneId);
    state.panes.push({ agent_name: CONTROL_PANE_LABEL, pane_id: firstPaneId, label: CONTROL_PANE_LABEL });
    await saveWorkspaceState(workingDir, state);
    attachSession(sessionName);
    return;
  }

  // First agent gets the initial pane
  const firstAgent = agents[0];
  setPaneTitle(firstAgent, firstPaneId);
  sendKeys(firstPaneId, resolveAgentCommand(firstAgent, config));
  state.panes.push({ agent_name: firstAgent, pane_id: firstPaneId, label: firstAgent });

  let lastPaneId = firstPaneId;

  // Remaining agents each get a new split pane
  for (let i = 1; i < agents.length; i++) {
    const agentName = agents[i];
    const newPaneId = splitPane(firstPaneId, { startDir: workingDir });
    setPaneTitle(agentName, newPaneId);
    sendKeys(newPaneId, resolveAgentCommand(agentName, config));
    state.panes.push({ agent_name: agentName, pane_id: newPaneId, label: agentName });
    lastPaneId = newPaneId;
  }

  // Create control pane (split vertically from the last agent pane)
  const controlPaneId = splitPane(lastPaneId, { startDir: workingDir });
  setPaneTitle(CONTROL_PANE_LABEL, controlPaneId);
  state.panes.push({ agent_name: CONTROL_PANE_LABEL, pane_id: controlPaneId, label: CONTROL_PANE_LABEL });

  // Apply layout
  const layout = pickLayout(agents.length);
  try {
    selectLayout(layout, sessionName);
  } catch {
    // Layout might fail on small terminals, non-fatal
  }

  // Resize control pane to be smaller
  try {
    resizePane(controlPaneId, { height: CONTROL_PANE_HEIGHT });
  } catch {
    // Non-fatal
  }

  // Focus control pane
  selectPane(controlPaneId);

  await saveWorkspaceState(workingDir, state);
  attachSession(sessionName);
}

export async function addAgentToWorkspace(
  agentName: string,
  workingDir: string,
  config: HandoffConfig
): Promise<void> {
  const state = await loadWorkspaceState(workingDir);
  if (!state) {
    throw new Error("No workspace found. Run 'handoff start' first.");
  }

  if (state.panes.some((p) => p.agent_name === agentName)) {
    throw new Error(`Agent '${agentName}' is already in the workspace.`);
  }

  if (!hasSession(state.session_name)) {
    throw new Error(`Session '${state.session_name}' is not running. Run 'handoff start' to create a new workspace.`);
  }

  // Find control pane to split from
  const controlPane = state.panes.find((p) => p.agent_name === CONTROL_PANE_LABEL);
  const splitTarget = controlPane?.pane_id ?? state.panes[0].pane_id;

  const newPaneId = splitPane(splitTarget, { startDir: workingDir });
  setPaneTitle(agentName, newPaneId);
  sendKeys(newPaneId, resolveAgentCommand(agentName, config));

  state.panes.push({ agent_name: agentName, pane_id: newPaneId, label: agentName });

  // Re-apply tiled layout
  try {
    selectLayout('tiled', state.session_name);
  } catch {
    // Non-fatal
  }

  await saveWorkspaceState(workingDir, state);
}

export async function removeAgentFromWorkspace(
  agentName: string,
  workingDir: string,
  config: HandoffConfig
): Promise<void> {
  const state = await loadWorkspaceState(workingDir);
  if (!state) {
    throw new Error("No workspace found. Run 'handoff start' first.");
  }

  const paneEntry = state.panes.find((p) => p.agent_name === agentName || p.label === agentName);
  if (!paneEntry) {
    throw new Error(`Agent '${agentName}' not found in workspace.`);
  }

  // Try graceful exit
  const agentConfig = getAgentConfig(agentName, config.agents);
  if (agentConfig?.exitCommand) {
    try {
      sendKeys(paneEntry.pane_id, agentConfig.exitCommand);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // Ignore, we'll kill it anyway
    }
  }

  try {
    killPane(paneEntry.pane_id);
  } catch {
    // Pane may already be gone
  }

  state.panes = state.panes.filter((p) => p.pane_id !== paneEntry.pane_id);

  // Re-apply layout
  if (state.panes.length > 0) {
    try {
      const agentCount = state.panes.filter((p) => p.agent_name !== CONTROL_PANE_LABEL).length;
      selectLayout(pickLayout(agentCount), state.session_name);
    } catch {
      // Non-fatal
    }
  }

  await saveWorkspaceState(workingDir, state);
}

export async function destroyWorkspace(
  workingDir: string,
  options?: { sessionName?: string }
): Promise<void> {
  const state = await loadWorkspaceState(workingDir);
  const sessionName = options?.sessionName ?? state?.session_name ?? DEFAULT_SESSION_NAME;

  if (hasSession(sessionName)) {
    killSession(sessionName);
  }

  try {
    await rm(join(workingDir, '.handoff', 'workspace.json'));
  } catch {
    // File may not exist
  }
}
