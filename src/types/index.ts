export interface Session {
  session_id: string;
  created_at: string;
  working_dir: string;
  file_hashes: Record<string, string>;
  excluded_patterns: string[];
  agent_name?: string;
  last_export?: string;
  last_query?: QueryLogEntry;
}

export interface FileChange {
  path: string;
  type: 'modified' | 'added' | 'deleted';
  diff?: string;
  isBinary?: boolean;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface QueryLogEntry {
  timestamp: string;
  agent: string;
  question: string;
  response?: string;
  pane_id?: string;
  duration_ms?: number;
}

export interface HandoffConfig {
  exclude_patterns: string[];
  max_diff_lines: number;
  diff_context_lines: number;
  tmux_capture_timeout_ms: number;
  memory_files: string[];
}

export interface TmuxPane {
  pane_id: string;
  pane_title: string;
  pane_pid: string;
  pane_current_command: string;
  window_name: string;
  session_name: string;
  active: boolean;
}

export interface DetectedAgent {
  name: string;
  pane: TmuxPane;
  label?: string;
}

export interface HandoffContext {
  session: Session;
  changes: FileChange[];
  message?: string;
  include_memory: boolean;
  memory_contents?: Record<string, string>;
  config: HandoffConfig;
}
