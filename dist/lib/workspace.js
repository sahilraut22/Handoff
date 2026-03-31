import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionError, TmuxError, AgentError, ErrorCode } from './errors.js';
import { logger } from './logger.js';
import { sanitizeAgentName } from './security.js';
import { initIpc, updatePresence } from './ipc.js';
import { hasSession, newSession, splitPane, killPane, killSession, selectPane, selectLayout, attachSession, resizePane, setPaneTitle, sendKeys, sourceConfig, } from './tmux.js';
import { getAgentConfig } from './agents.js';
const DEFAULT_SESSION_NAME = 'handoff';
const CONTROL_PANE_LABEL = 'control';
const CONTROL_PANE_HEIGHT = 8;
const TITLE_STABILIZE_DELAYS_MS = [300, 1200];
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function stabilizePaneTitle(paneId, title) {
    // Some shells/TUI apps emit terminal title escape sequences during startup.
    // Re-assert pane titles shortly after launch so agent labels stay fixed.
    for (const delayMs of TITLE_STABILIZE_DELAYS_MS) {
        await sleep(delayMs);
        try {
            setPaneTitle(title, paneId);
        }
        catch {
            // Pane may be closed; best-effort only.
            return;
        }
    }
}
export async function loadWorkspaceState(workingDir) {
    try {
        const content = await readFile(join(workingDir, '.handoff', 'workspace.json'), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export async function saveWorkspaceState(workingDir, state) {
    await mkdir(join(workingDir, '.handoff'), { recursive: true });
    await writeFile(join(workingDir, '.handoff', 'workspace.json'), JSON.stringify(state, null, 2), 'utf-8');
}
function resolveAgentCommand(agentName, config) {
    const agentConfig = getAgentConfig(agentName, config.agents);
    return agentConfig?.command ?? agentName;
}
function pickLayout(agentCount) {
    if (agentCount >= 3)
        return 'tiled';
    if (agentCount === 2)
        return 'even-horizontal';
    return 'even-horizontal';
}
export async function createWorkspace(agents, workingDir, config, options) {
    const sessionName = options?.sessionName ?? DEFAULT_SESSION_NAME;
    if (hasSession(sessionName)) {
        throw new TmuxError(ErrorCode.TMUX_SESSION_NOT_FOUND, `Session '${sessionName}' already exists. Use 'handoff attach' to reconnect or 'handoff kill --force' to destroy it.`, { recoveryHint: "Run 'handoff attach' to reconnect or 'handoff kill --force' to destroy it." });
    }
    // Create detached session, capture first pane ID
    const firstPaneId = newSession(sessionName, { detached: true, startDir: workingDir });
    // Load tmux config into the running server
    if (options?.tmuxConfigPath) {
        sourceConfig(options.tmuxConfigPath);
    }
    const state = {
        session_name: sessionName,
        created_at: new Date().toISOString(),
        working_dir: workingDir,
        panes: [],
    };
    // Validate agent names before proceeding
    for (const agent of agents) {
        sanitizeAgentName(agent);
    }
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
    logger.debug('Creating workspace pane', { agent: firstAgent, pane: firstPaneId });
    setPaneTitle(firstAgent, firstPaneId);
    sendKeys(firstPaneId, resolveAgentCommand(firstAgent, config));
    state.panes.push({ agent_name: firstAgent, pane_id: firstPaneId, label: firstAgent });
    const titleStabilizers = [stabilizePaneTitle(firstPaneId, firstAgent)];
    let lastPaneId = firstPaneId;
    // Remaining agents each get a new split pane
    for (let i = 1; i < agents.length; i++) {
        const agentName = agents[i];
        const newPaneId = splitPane(firstPaneId, { startDir: workingDir });
        setPaneTitle(agentName, newPaneId);
        sendKeys(newPaneId, resolveAgentCommand(agentName, config));
        state.panes.push({ agent_name: agentName, pane_id: newPaneId, label: agentName });
        titleStabilizers.push(stabilizePaneTitle(newPaneId, agentName));
        lastPaneId = newPaneId;
    }
    // Create control pane (split vertically from the last agent pane)
    const controlPaneId = splitPane(lastPaneId, { startDir: workingDir });
    setPaneTitle(CONTROL_PANE_LABEL, controlPaneId);
    state.panes.push({ agent_name: CONTROL_PANE_LABEL, pane_id: controlPaneId, label: CONTROL_PANE_LABEL });
    titleStabilizers.push(stabilizePaneTitle(controlPaneId, CONTROL_PANE_LABEL));
    // Apply layout
    const layout = pickLayout(agents.length);
    try {
        selectLayout(layout, sessionName);
    }
    catch {
        // Layout might fail on small terminals, non-fatal
    }
    // Resize control pane to be smaller
    try {
        resizePane(controlPaneId, { height: CONTROL_PANE_HEIGHT });
    }
    catch {
        // Non-fatal
    }
    // Focus control pane
    selectPane(controlPaneId);
    await Promise.all(titleStabilizers);
    await saveWorkspaceState(workingDir, state);
    // Initialize file-based IPC directory and register agent presences
    const ipcDir = join(workingDir, '.handoff', 'ipc');
    await initIpc(ipcDir).catch(() => undefined);
    for (const agentName of agents) {
        await updatePresence(ipcDir, agentName, 'active').catch(() => undefined);
    }
    attachSession(sessionName);
}
export async function addAgentToWorkspace(agentName, workingDir, config) {
    sanitizeAgentName(agentName);
    const state = await loadWorkspaceState(workingDir);
    if (!state) {
        throw new SessionError(ErrorCode.SESSION_NOT_FOUND, "No workspace found.", { recoveryHint: "Run 'handoff start' first." });
    }
    if (state.panes.some((p) => p.agent_name === agentName)) {
        throw new TmuxError(ErrorCode.TMUX_PANE_NOT_FOUND, `Agent '${agentName}' is already in the workspace.`);
    }
    if (!hasSession(state.session_name)) {
        throw new TmuxError(ErrorCode.TMUX_SESSION_NOT_FOUND, `Session '${state.session_name}' is not running.`, { recoveryHint: "Run 'handoff start' to create a new workspace." });
    }
    // Find control pane to split from
    const controlPane = state.panes.find((p) => p.agent_name === CONTROL_PANE_LABEL);
    const splitTarget = controlPane?.pane_id ?? state.panes[0].pane_id;
    const newPaneId = splitPane(splitTarget, { startDir: workingDir });
    setPaneTitle(agentName, newPaneId);
    sendKeys(newPaneId, resolveAgentCommand(agentName, config));
    await stabilizePaneTitle(newPaneId, agentName);
    state.panes.push({ agent_name: agentName, pane_id: newPaneId, label: agentName });
    // Re-apply tiled layout
    try {
        selectLayout('tiled', state.session_name);
    }
    catch {
        // Non-fatal
    }
    await saveWorkspaceState(workingDir, state);
}
export async function removeAgentFromWorkspace(agentName, workingDir, config) {
    const state = await loadWorkspaceState(workingDir);
    if (!state) {
        throw new SessionError(ErrorCode.SESSION_NOT_FOUND, "No workspace found.", { recoveryHint: "Run 'handoff start' first." });
    }
    const paneEntry = state.panes.find((p) => p.agent_name === agentName || p.label === agentName);
    if (!paneEntry) {
        throw new AgentError(ErrorCode.AGENT_NOT_FOUND, `Agent '${agentName}' not found in workspace.`);
    }
    // Try graceful exit
    const agentConfig = getAgentConfig(agentName, config.agents);
    if (agentConfig?.exitCommand) {
        try {
            sendKeys(paneEntry.pane_id, agentConfig.exitCommand);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        catch {
            // Ignore, we'll kill it anyway
        }
    }
    try {
        killPane(paneEntry.pane_id);
    }
    catch {
        // Pane may already be gone
    }
    state.panes = state.panes.filter((p) => p.pane_id !== paneEntry.pane_id);
    // Re-apply layout
    if (state.panes.length > 0) {
        try {
            const agentCount = state.panes.filter((p) => p.agent_name !== CONTROL_PANE_LABEL).length;
            selectLayout(pickLayout(agentCount), state.session_name);
        }
        catch {
            // Non-fatal
        }
    }
    await saveWorkspaceState(workingDir, state);
}
export async function destroyWorkspace(workingDir, options) {
    const state = await loadWorkspaceState(workingDir);
    const sessionName = options?.sessionName ?? state?.session_name ?? DEFAULT_SESSION_NAME;
    if (hasSession(sessionName)) {
        killSession(sessionName);
    }
    try {
        await rm(join(workingDir, '.handoff', 'workspace.json'));
    }
    catch {
        // File may not exist
    }
}
//# sourceMappingURL=workspace.js.map