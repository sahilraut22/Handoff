import type { WorkspaceState, HandoffConfig } from '../types/index.js';
export declare function loadWorkspaceState(workingDir: string): Promise<WorkspaceState | null>;
export declare function saveWorkspaceState(workingDir: string, state: WorkspaceState): Promise<void>;
export declare function createWorkspace(agents: string[], workingDir: string, config: HandoffConfig, options?: {
    sessionName?: string;
    tmuxConfigPath?: string;
}): Promise<void>;
export declare function addAgentToWorkspace(agentName: string, workingDir: string, config: HandoffConfig): Promise<void>;
export declare function removeAgentFromWorkspace(agentName: string, workingDir: string, config: HandoffConfig): Promise<void>;
export declare function destroyWorkspace(workingDir: string, options?: {
    sessionName?: string;
}): Promise<void>;
