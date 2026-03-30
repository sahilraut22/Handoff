import { stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { extractDecisions } from './decision-extractor.js';
import type { MonitorConfig, MonitoredAgent, ExtractedDecision } from '../types/index.js';

export type { MonitorConfig, MonitoredAgent };

// Known log file locations per agent (paths relative to home dir)
const AGENT_LOG_PATHS: Record<string, string[]> = {
  claude: [
    '.claude/logs',
    '.claude/projects',
  ],
  codex: [
    '.codex/logs',
    '.codex/conversations',
  ],
  gemini: [
    '.gemini/logs',
  ],
  aider: [
    '.aider.logs',
  ],
  cursor: [
    '.cursor/logs',
    'AppData/Roaming/Cursor/logs',
  ],
  copilot: [
    '.copilot/logs',
  ],
};

export function discoverAgentLogs(agent: string): string[] {
  const home = homedir();
  const knownPaths = AGENT_LOG_PATHS[agent.toLowerCase()] ?? [];
  return knownPaths.map((p) => join(home, p));
}

async function findExistingLogPath(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p);
      return p;
    } catch {
      // Not found, try next
    }
  }
  return null;
}

export interface LogMonitorHandle {
  start: () => void;
  stop: () => void;
  getExtracted: () => ExtractedDecision[];
}

export function createLogMonitor(config: MonitorConfig): LogMonitorHandle {
  let timer: ReturnType<typeof setInterval> | null = null;
  let offset = config.last_read_offset;
  let lastSize = 0;
  const extracted: ExtractedDecision[] = [];

  async function poll(logPath: string): Promise<void> {
    try {
      const info = await stat(logPath);
      const currentSize = info.size;

      // Handle log rotation: file shrank
      if (currentSize < lastSize) {
        offset = 0;
      }
      lastSize = currentSize;

      if (currentSize <= offset) return;

      // Read only new content since last offset
      const fd = await import('node:fs/promises').then((m) => m.open(logPath, 'r'));
      const buffer = Buffer.alloc(currentSize - offset);
      await fd.read(buffer, 0, buffer.length, offset);
      await fd.close();

      offset = currentSize;
      const newContent = buffer.toString('utf-8');

      if (newContent.trim()) {
        const found = extractDecisions(newContent, 'conversation', {
          min_confidence: 0.5,
          max_decisions_per_scan: 5,
        });
        extracted.push(...found);
      }
    } catch {
      // Log file may not exist yet or be inaccessible
    }
  }

  function start(): void {
    if (!config.log_paths[0]) return;
    const logPath = config.log_paths[0];

    timer = setInterval(() => {
      void poll(logPath);
    }, config.poll_interval_ms);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getExtracted(): ExtractedDecision[] {
    return [...extracted];
  }

  return { start, stop, getExtracted };
}

export async function detectAgentLog(agent: string): Promise<MonitoredAgent> {
  const paths = discoverAgentLogs(agent);
  const found = await findExistingLogPath(paths);

  if (!found) {
    return { name: agent, log_path: null, status: 'not-found' };
  }

  return { name: agent, log_path: found, status: 'monitoring' };
}

export async function monitorAgentLogs(
  agents: string[],
  pollIntervalMs = 5000
): Promise<LogMonitorHandle[]> {
  const handles: LogMonitorHandle[] = [];

  for (const agent of agents) {
    const detected = await detectAgentLog(agent);
    if (!detected.log_path) continue;

    const config: MonitorConfig = {
      agent,
      log_paths: [detected.log_path],
      poll_interval_ms: pollIntervalMs,
      last_read_offset: 0,
    };

    handles.push(createLogMonitor(config));
  }

  return handles;
}
