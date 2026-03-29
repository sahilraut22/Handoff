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

export interface AgentConfig {
  name: string;
  command: string;
  processName: string;
  memoryFile?: string;
  exitCommand?: string;
}

export interface WorkspacePane {
  agent_name: string;
  pane_id: string;
  label: string;
}

export interface WorkspaceState {
  session_name: string;
  created_at: string;
  working_dir: string;
  panes: WorkspacePane[];
}

export interface TmuxConfig {
  mouse: boolean;
  scrollback: number;
  keybindings: boolean;
  clipboard: boolean;
  paneLabels: boolean;
  heavyBorders: boolean;
}

// --- Compression types ---

export type ChangePriority = 'critical' | 'high' | 'medium' | 'low';

export interface CompressedChange extends FileChange {
  priority: ChangePriority;
  summary: string;
  functions_changed?: string[];
  compressed_diff?: string;
}

export interface CompressionOptions {
  token_budget?: number;
  priority_threshold?: ChangePriority;
  include_full_diff?: boolean;
}

export interface CompressionResult {
  changes: CompressedChange[];
  stats: {
    total_changes: number;
    included_changes: number;
    omitted_changes: number;
    estimated_tokens: number;
    budget_used_pct: number;
  };
}

export interface CompressionConfig {
  enabled: boolean;
  token_budget: number;
  priority_threshold: ChangePriority;
  semantic_analysis: boolean;
}

// --- Decision journal types ---

export type DecisionStatus = 'accepted' | 'proposed' | 'superseded' | 'deprecated';

export interface Decision {
  id: string;
  title: string;
  status: DecisionStatus;
  date: string;
  context: string;
  decision: string;
  alternatives?: string[];
  consequences?: string;
  tags?: string[];
  supersedes?: string;
  agent?: string;
}

// --- Protocol / frontmatter types ---

export interface HandoffFrontmatter {
  handoff_version: string;
  session_id: string;
  created_at: string;
  duration: string;
  working_dir: string;
  agent?: string;
  changes: { modified: number; added: number; deleted: number };
  compression?: { enabled: boolean; token_budget: number; tokens_used: number };
  priority_files?: string[];
  decisions_included?: number;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// --- Main config ---

export interface HandoffConfig {
  exclude_patterns: string[];
  max_diff_lines: number;
  diff_context_lines: number;
  tmux_capture_timeout_ms: number;
  memory_files: string[];
  agents?: Record<string, Partial<AgentConfig>>;
  tmux?: Partial<TmuxConfig>;
  compression?: Partial<CompressionConfig>;
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
  compression_result?: CompressionResult;
  decisions?: Decision[];
}
