import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { extractDecisions } from './decision-extractor.js';
// Known log file locations per agent (paths relative to home dir)
const AGENT_LOG_PATHS = {
    claude: [
        '.claude/projects',
        '.claude/logs',
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
export function discoverAgentLogs(agent) {
    const home = homedir();
    const knownPaths = AGENT_LOG_PATHS[agent.toLowerCase()] ?? [];
    return knownPaths.map((p) => join(home, p));
}
async function findExistingLogPath(paths) {
    for (const p of paths) {
        try {
            await stat(p);
            return p;
        }
        catch {
            // Not found, try next
        }
    }
    return null;
}
/** Recursively find log files (.jsonl, .log, .txt) up to `depth` directory levels deep. */
async function findLogFilesInDir(dir, depth) {
    if (depth === 0)
        return [];
    const files = [];
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isFile() && /\.(jsonl|log|txt)$/i.test(entry.name)) {
                files.push(full);
            }
            else if (entry.isDirectory() && depth > 1) {
                files.push(...await findLogFilesInDir(full, depth - 1));
            }
        }
    }
    catch {
        // Directory inaccessible or gone
    }
    return files;
}
/** Resolve all log_paths to actual readable files, expanding directories recursively. */
async function resolveLogFiles(logPaths) {
    const files = [];
    for (const p of logPaths) {
        try {
            const info = await stat(p);
            if (info.isFile()) {
                files.push(p);
            }
            else if (info.isDirectory()) {
                files.push(...await findLogFilesInDir(p, 2));
            }
        }
        catch {
            // Path doesn't exist yet — skip
        }
    }
    return files;
}
export function createLogMonitor(config) {
    let timer = null;
    // Per-file read offsets — files not yet seen start at 0 (or their size at baseline)
    const fileOffsets = new Map();
    const extracted = [];
    async function readNewContent(filePath) {
        try {
            const info = await stat(filePath);
            const currentOffset = fileOffsets.get(filePath) ?? 0;
            // Handle log rotation: file shrank
            const adjustedOffset = info.size < currentOffset ? 0 : currentOffset;
            if (info.size <= adjustedOffset)
                return;
            const { open } = await import('node:fs/promises');
            const fd = await open(filePath, 'r');
            const buffer = Buffer.alloc(info.size - adjustedOffset);
            await fd.read(buffer, 0, buffer.length, adjustedOffset);
            await fd.close();
            fileOffsets.set(filePath, info.size);
            const newContent = buffer.toString('utf-8');
            if (newContent.trim()) {
                const found = extractDecisions(newContent, 'conversation', {
                    min_confidence: 0.5,
                    max_decisions_per_scan: 5,
                });
                extracted.push(...found);
            }
        }
        catch {
            // File may not exist yet or be inaccessible
        }
    }
    async function pollAll() {
        const files = await resolveLogFiles(config.log_paths);
        await Promise.all(files.map((f) => readNewContent(f)));
    }
    function start() {
        if (config.log_paths.length === 0)
            return;
        // Snapshot baseline: record current sizes of all existing files so we only
        // read content produced during this session (not old log history).
        void resolveLogFiles(config.log_paths).then(async (files) => {
            await Promise.all(files.map(async (f) => {
                try {
                    const info = await stat(f);
                    // Only set baseline if not already set (start() called once)
                    if (!fileOffsets.has(f)) {
                        fileOffsets.set(f, info.size);
                    }
                }
                catch {
                    // File vanished between scan and stat — skip
                }
            }));
        });
        timer = setInterval(() => {
            void pollAll();
        }, config.poll_interval_ms);
    }
    async function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        // Final poll to capture content written in the last interval before agent exited
        await pollAll();
    }
    function getExtracted() {
        return [...extracted];
    }
    return { start, stop, getExtracted };
}
export async function detectAgentLog(agent) {
    const paths = discoverAgentLogs(agent);
    const found = await findExistingLogPath(paths);
    if (!found) {
        return { name: agent, log_path: null, status: 'not-found' };
    }
    return { name: agent, log_path: found, status: 'monitoring' };
}
export async function monitorAgentLogs(agents, pollIntervalMs = 5000) {
    const handles = [];
    for (const agent of agents) {
        const detected = await detectAgentLog(agent);
        if (!detected.log_path)
            continue;
        const config = {
            agent,
            log_paths: [detected.log_path],
            poll_interval_ms: pollIntervalMs,
            last_read_offset: 0,
        };
        handles.push(createLogMonitor(config));
    }
    return handles;
}
//# sourceMappingURL=conversation-monitor.js.map