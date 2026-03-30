import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};
class Logger {
    level;
    jsonMode;
    constructor() {
        const envLevel = process.env['HANDOFF_LOG_LEVEL'];
        this.level = envLevel && envLevel in LEVEL_ORDER ? envLevel : 'info';
        this.jsonMode = process.env['HANDOFF_LOG_FORMAT'] === 'json';
    }
    setLevel(level) {
        this.level = level;
    }
    setJsonMode(enabled) {
        this.jsonMode = enabled;
    }
    shouldLog(level) {
        return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
    }
    emit(level, message, context) {
        if (!this.shouldLog(level))
            return;
        if (this.jsonMode) {
            const entry = {
                level,
                message,
                timestamp: new Date().toISOString(),
            };
            if (context && Object.keys(context).length > 0) {
                entry['context'] = context;
            }
            process.stderr.write(JSON.stringify(entry) + '\n');
        }
        else {
            const prefix = `[${level.toUpperCase()}]`;
            let line = `${prefix} ${message}`;
            if (context && Object.keys(context).length > 0) {
                const pairs = Object.entries(context)
                    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                    .join(' ');
                line += ` ${pairs}`;
            }
            process.stderr.write(line + '\n');
        }
    }
    debug(message, context) {
        this.emit('debug', message, context);
    }
    info(message, context) {
        this.emit('info', message, context);
    }
    warn(message, context) {
        this.emit('warn', message, context);
    }
    error(message, context) {
        this.emit('error', message, context);
    }
    /**
     * Start a timer. Returns a function that, when called, logs the elapsed time.
     */
    time(label) {
        const startMs = Date.now();
        return () => {
            const elapsed = Date.now() - startMs;
            this.debug(`${label} completed`, { elapsed_ms: elapsed });
        };
    }
}
export const logger = new Logger();
// --- Query log (preserved for backward compatibility) ---
export async function appendQueryLog(workingDir, entry) {
    const logPath = join(workingDir, '.handoff', 'queries.log');
    try {
        await mkdir(dirname(logPath), { recursive: true });
        await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
    }
    catch {
        // Non-fatal: log append failure should never crash the CLI
    }
}
export async function readQueryLog(workingDir) {
    const logPath = join(workingDir, '.handoff', 'queries.log');
    try {
        const content = await readFile(logPath, 'utf-8');
        return content
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=logger.js.map