/**
 * Agent state tracking for delta exports.
 * Records what each agent has already received so subsequent exports
 * only include new/changed context.
 */
import type { FileChange, AgentKnowledge, AgentStateStore, DeltaResult } from '../types/index.js';
export declare function loadAgentState(handoffDir: string): Promise<AgentStateStore>;
export declare function saveAgentState(handoffDir: string, state: AgentStateStore): Promise<void>;
export declare function getAgentKnowledge(state: AgentStateStore, agent: string): AgentKnowledge | null;
export declare function updateAgentKnowledge(state: AgentStateStore, agent: string, changes: FileChange[], decisionIds: string[], context: AgentKnowledge['knownContext']): void;
export declare function computeDelta(allChanges: FileChange[], allDecisionIds: string[], agentKnowledge: AgentKnowledge | null): DeltaResult;
