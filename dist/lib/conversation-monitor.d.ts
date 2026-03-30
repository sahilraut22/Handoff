import type { MonitorConfig, MonitoredAgent, ExtractedDecision } from '../types/index.js';
export type { MonitorConfig, MonitoredAgent };
export declare function discoverAgentLogs(agent: string): string[];
export interface LogMonitorHandle {
    start: () => void;
    stop: () => void;
    getExtracted: () => ExtractedDecision[];
}
export declare function createLogMonitor(config: MonitorConfig): LogMonitorHandle;
export declare function detectAgentLog(agent: string): Promise<MonitoredAgent>;
export declare function monitorAgentLogs(agents: string[], pollIntervalMs?: number): Promise<LogMonitorHandle[]>;
