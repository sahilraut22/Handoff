import type { TmuxPane, DetectedAgent, AgentConfig } from '../types/index.js';
export declare const AGENT_REGISTRY: Record<string, AgentConfig>;
export declare function getAgentConfig(name: string, customAgents?: Record<string, Partial<AgentConfig>>): AgentConfig | undefined;
export declare function listKnownAgents(customAgents?: Record<string, Partial<AgentConfig>>): string[];
export declare function detectAgents(panes: TmuxPane[]): DetectedAgent[];
export declare function findAgent(name: string, panes: TmuxPane[]): DetectedAgent | undefined;
export declare function buildPromptWithContext(question: string, workingDir: string, includeContext: boolean): Promise<string>;
