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
export type ChangePriority = 'critical' | 'high' | 'medium' | 'low';
export interface CompressedChange extends FileChange {
    priority: ChangePriority;
    summary: string;
    functions_changed?: string[];
    compressed_diff?: string;
}
export interface QueryContext {
    query: string;
    keywords: string[];
}
export interface CompressionOptions {
    token_budget?: number;
    priority_threshold?: ChangePriority;
    include_full_diff?: boolean;
    query?: QueryContext;
}
export interface AgentKnowledge {
    lastHandoff: string;
    knownDecisions: string[];
    knownFileHashes: Record<string, string>;
    knownContext: {
        headline?: string;
        criticalBlockers?: string[];
        constraints?: string[];
    };
}
export interface AgentStateStore {
    version: '1.0';
    agents: Record<string, AgentKnowledge>;
}
export interface DeltaResult {
    newChanges: FileChange[];
    newDecisions: string[];
    unchangedCount: number;
    isFullHandoff: boolean;
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
    confidence?: number;
    source?: 'manual' | 'diff' | 'conversation' | 'commit' | 'state';
    source_location?: string;
    auto_extracted?: boolean;
}
export interface HandoffFrontmatter {
    handoff_version: string;
    session_id: string;
    created_at: string;
    duration: string;
    working_dir: string;
    agent?: string;
    changes: {
        modified: number;
        added: number;
        deleted: number;
    };
    compression?: {
        enabled: boolean;
        token_budget: number;
        tokens_used: number;
    };
    priority_files?: string[];
    decisions_included?: number;
}
export interface ProtocolValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}
export interface ProtocolValidationResult {
    valid: boolean;
    errors: ProtocolValidationError[];
}
export interface HandoffConfig {
    exclude_patterns: string[];
    max_diff_lines: number;
    diff_context_lines: number;
    tmux_capture_timeout_ms: number;
    memory_files: string[];
    agents?: Record<string, Partial<AgentConfig>>;
    tmux?: Partial<TmuxConfig>;
    compression?: Partial<CompressionConfig>;
    daemon?: Partial<DaemonConfig>;
    ipc?: Partial<IpcConfig>;
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
export interface WatcherConfig {
    working_dir: string;
    exclude_patterns: string[];
    debounce_ms: number;
    auto_regenerate: boolean;
    change_threshold: number;
    max_regen_interval_ms: number;
}
export interface WatcherState {
    pid: number;
    started_at: string;
    last_scan: string;
    changes_since_regen: number;
    total_regenerations: number;
    watched_files: number;
}
export interface DaemonConfig {
    enabled: boolean;
    auto_start: boolean;
    detach: boolean;
    debounce_ms: number;
    change_threshold: number;
    max_regen_interval_ms: number;
}
export interface DecisionPattern {
    name: string;
    trigger: RegExp;
    context_window: number;
    confidence_base: number;
    tag?: string;
}
export interface ExtractionConfig {
    min_confidence: number;
    max_decisions_per_scan: number;
    patterns: DecisionPattern[];
}
export interface ExtractedDecision {
    title: string;
    context: string;
    decision: string;
    alternatives: string[];
    confidence: number;
    source: 'diff' | 'conversation' | 'commit' | 'state';
    source_location?: string;
    tags: string[];
}
export interface TechSnapshot {
    timestamp: string;
    /** category -> list of detected tech names currently in use */
    techs: Record<string, string[]>;
}
export interface TechStateHistory {
    /** Full history per category: all techs ever seen, oldest first */
    history: Record<string, string[]>;
    /** Most recent snapshot */
    last: TechSnapshot;
}
export interface MonitorConfig {
    agent: string;
    log_paths: string[];
    poll_interval_ms: number;
    last_read_offset: number;
}
export interface MonitoredAgent {
    name: string;
    log_path: string | null;
    status: 'monitoring' | 'not-found' | 'error';
}
export interface IpcMessage {
    id: string;
    from: string;
    to: string;
    timestamp: string;
    type: 'text' | 'context' | 'command' | 'heartbeat' | 'event';
    content: string;
    metadata?: Record<string, unknown>;
    ttl_ms?: number;
}
export interface IpcConfig {
    ipc_dir: string;
    heartbeat_interval_ms: number;
    heartbeat_timeout_ms: number;
    message_ttl_ms: number;
    max_inbox_size: number;
    cleanup_interval_ms: number;
}
export interface AgentPresence {
    agent: string;
    status: 'active' | 'idle' | 'offline';
    last_heartbeat: string;
    pid?: number;
    working_dir?: string;
    capabilities?: string[];
}
export interface ContextFile {
    version: '3.0';
    session_id: string;
    last_updated: string;
    last_updated_by: string;
    content_hash: string;
    agents_notified: string[];
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
    delta?: {
        isDelta: boolean;
        unchangedCount: number;
        targetAgent?: string;
    };
}
