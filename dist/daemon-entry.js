/**
 * Daemon entry point -- run as a detached child process by daemon.ts.
 * Reads configuration from environment variables set by startDaemon().
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createWriteStream } from 'node:fs';
import { loadConfig } from './lib/config.js';
import { createWatcher } from './lib/watcher.js';
import { writePidFile, removePidFile } from './lib/daemon.js';
import { hashAllFiles, computeChanges, walkFiles } from './lib/snapshot.js';
import { generateHandoffMarkdown } from './lib/markdown.js';
import { loadSession, saveSession } from './lib/session.js';
import { logger } from './lib/logger.js';
const WORKING_DIR = process.env['HANDOFF_DAEMON_WORKING_DIR'] ?? process.cwd();
const PID_FILE = process.env['HANDOFF_DAEMON_PID_FILE'] ?? join(WORKING_DIR, '.handoff/daemon.pid');
const LOG_FILE = process.env['HANDOFF_DAEMON_LOG_FILE'] ?? join(WORKING_DIR, '.handoff/daemon.log');
const DEBOUNCE_MS = parseInt(process.env['HANDOFF_DAEMON_DEBOUNCE_MS'] ?? '2000', 10);
const CHANGE_THRESHOLD = parseInt(process.env['HANDOFF_DAEMON_CHANGE_THRESHOLD'] ?? '3', 10);
const MAX_REGEN_MS = parseInt(process.env['HANDOFF_DAEMON_MAX_REGEN_MS'] ?? '60000', 10);
async function main() {
    // Redirect output to log file
    const logStream = createWriteStream(LOG_FILE, { flags: 'a' });
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...args) => {
        logStream.write(String(chunk));
        return origWrite(chunk, ...args);
    };
    try {
        // Write PID file
        await mkdir(dirname(PID_FILE), { recursive: true });
        await writePidFile(PID_FILE);
        const config = await loadConfig(WORKING_DIR);
        const watcherConfig = {
            working_dir: WORKING_DIR,
            exclude_patterns: config.exclude_patterns,
            debounce_ms: config.daemon?.debounce_ms ?? DEBOUNCE_MS,
            auto_regenerate: true,
            change_threshold: config.daemon?.change_threshold ?? CHANGE_THRESHOLD,
            max_regen_interval_ms: config.daemon?.max_regen_interval_ms ?? MAX_REGEN_MS,
        };
        const watcher = createWatcher(watcherConfig, {
            onFileChange: (_path, _type) => {
                // Handled via debounce in watcher
            },
            onRegenerate: async (changedPaths) => {
                try {
                    logger.info('Daemon: regenerating HANDOFF.md', { changed: changedPaths.length });
                    const session = await loadSession(WORKING_DIR).catch(() => null);
                    if (!session)
                        return;
                    const files = await walkFiles(WORKING_DIR, config.exclude_patterns);
                    const newHashes = await hashAllFiles(WORKING_DIR, files);
                    const changes = await computeChanges(WORKING_DIR, join(WORKING_DIR, '.handoff/snapshots'), session.file_hashes, newHashes, config);
                    const markdown = generateHandoffMarkdown({
                        session,
                        changes,
                        include_memory: false,
                        config,
                    });
                    await writeFile(join(WORKING_DIR, 'HANDOFF.md'), markdown, 'utf-8');
                    // Update session hashes
                    session.file_hashes = newHashes;
                    session.last_export = new Date().toISOString();
                    await saveSession(WORKING_DIR, session);
                    logger.info('Daemon: HANDOFF.md regenerated', { changes: changes.length });
                }
                catch (err) {
                    logger.error('Daemon: regeneration failed', { error: err instanceof Error ? err.message : String(err) });
                }
            },
            onError: (err) => {
                logger.error('Daemon: watcher error', { error: err.message });
            },
        });
        // Graceful shutdown
        const shutdown = async () => {
            logger.info('Daemon: shutting down');
            await watcher.stop();
            await removePidFile(PID_FILE);
            process.exit(0);
        };
        process.on('SIGTERM', () => { void shutdown(); });
        process.on('SIGINT', () => { void shutdown(); });
        await watcher.start();
        logger.info('Daemon: started', { working_dir: WORKING_DIR, pid: process.pid });
    }
    catch (err) {
        logger.error('Daemon: startup failed', { error: err instanceof Error ? err.message : String(err) });
        await removePidFile(PID_FILE).catch(() => undefined);
        process.exit(1);
    }
}
void main();
//# sourceMappingURL=daemon-entry.js.map