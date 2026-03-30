import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { QueryLogEntry } from '../types/index.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

class Logger {
  private level: LogLevel;
  private jsonMode: boolean;

  constructor() {
    const envLevel = process.env['HANDOFF_LOG_LEVEL'] as LogLevel | undefined;
    this.level = envLevel && envLevel in LEVEL_ORDER ? envLevel : 'info';
    this.jsonMode = process.env['HANDOFF_LOG_FORMAT'] === 'json';
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setJsonMode(enabled: boolean): void {
    this.jsonMode = enabled;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    if (this.jsonMode) {
      const entry: Record<string, unknown> = {
        level,
        message,
        timestamp: new Date().toISOString(),
      };
      if (context && Object.keys(context).length > 0) {
        entry['context'] = context;
      }
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
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

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }

  /**
   * Start a timer. Returns a function that, when called, logs the elapsed time.
   */
  time(label: string): () => void {
    const startMs = Date.now();
    return () => {
      const elapsed = Date.now() - startMs;
      this.debug(`${label} completed`, { elapsed_ms: elapsed });
    };
  }
}

export const logger = new Logger();

// --- Query log (preserved for backward compatibility) ---

export async function appendQueryLog(workingDir: string, entry: QueryLogEntry): Promise<void> {
  const logPath = join(workingDir, '.handoff', 'queries.log');
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Non-fatal: log append failure should never crash the CLI
  }
}

export async function readQueryLog(workingDir: string): Promise<QueryLogEntry[]> {
  const logPath = join(workingDir, '.handoff', 'queries.log');
  try {
    const content = await readFile(logPath, 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as QueryLogEntry);
  } catch {
    return [];
  }
}
