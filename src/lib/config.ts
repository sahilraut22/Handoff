import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HandoffConfig, AgentConfig } from '../types/index.js';

const DEFAULT_CONFIG: HandoffConfig = {
  exclude_patterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.handoff',
    '*.lock',
    'package-lock.json',
  ],
  max_diff_lines: 50,
  diff_context_lines: 3,
  tmux_capture_timeout_ms: 10000,
  memory_files: ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'GEMINI.md'],
};

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeConfig(base: HandoffConfig, override: Record<string, unknown>): HandoffConfig {
  const merged = { ...base };

  if (Array.isArray(override.exclude_patterns)) {
    merged.exclude_patterns = [...new Set([...base.exclude_patterns, ...override.exclude_patterns as string[]])];
  }
  if (typeof override.max_diff_lines === 'number') {
    merged.max_diff_lines = override.max_diff_lines;
  }
  if (typeof override.diff_context_lines === 'number') {
    merged.diff_context_lines = override.diff_context_lines;
  }
  if (typeof override.tmux_capture_timeout_ms === 'number') {
    merged.tmux_capture_timeout_ms = override.tmux_capture_timeout_ms;
  }
  if (Array.isArray(override.memory_files)) {
    merged.memory_files = override.memory_files as string[];
  }
  if (typeof override.agents === 'object' && override.agents !== null && !Array.isArray(override.agents)) {
    merged.agents = { ...(base.agents ?? {}), ...(override.agents as Record<string, Partial<AgentConfig>>) };
  }

  return merged;
}

export async function loadConfig(workingDir: string): Promise<HandoffConfig> {
  let config = { ...DEFAULT_CONFIG };

  // User-level config: ~/.handoffrc
  const userConfig = await readJsonFile(join(homedir(), '.handoffrc'));
  if (userConfig) {
    config = mergeConfig(config, userConfig);
  }

  // Project-level config: .handoff/config.json
  const projectConfig = await readJsonFile(join(workingDir, '.handoff', 'config.json'));
  if (projectConfig) {
    config = mergeConfig(config, projectConfig);
  }

  return config;
}

export { DEFAULT_CONFIG };
