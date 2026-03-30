import { resolve, join } from 'node:path';
import { createWatcher } from '../lib/watcher.js';
import { startDaemon, stopDaemon, isDaemonRunning, getDaemonStatus } from '../lib/daemon.js';
import { loadConfig } from '../lib/config.js';
import { SessionError, ErrorCode } from '../lib/errors.js';
import { loadSession } from '../lib/session.js';
export function registerWatchCommand(program) {
    program
        .command('watch')
        .description('Start background file watcher that auto-regenerates HANDOFF.md on changes')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .option('--stop', 'Stop the running daemon')
        .option('--status', 'Show daemon status')
        .option('--no-detach', 'Run in foreground (do not detach)')
        .option('--debounce <ms>', 'Debounce interval in ms', '2000')
        .option('--threshold <n>', 'Number of changes before auto-regen', '3')
        .action(async (options) => {
        const workingDir = resolve(options.dir ?? process.cwd());
        // -- Stop --
        if (options.stop) {
            const running = await isDaemonRunning(workingDir);
            if (!running) {
                console.log('No daemon is currently running.');
                return;
            }
            await stopDaemon(workingDir);
            console.log('Daemon stopped.');
            return;
        }
        // -- Status --
        if (options.status) {
            const running = await isDaemonRunning(workingDir);
            if (!running) {
                console.log('Daemon is not running.');
                return;
            }
            const state = await getDaemonStatus(workingDir);
            if (!state) {
                console.log('Daemon is running but status unavailable.');
                return;
            }
            const uptimeSec = Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000);
            const uptimeStr = uptimeSec < 60 ? `${uptimeSec}s` : `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`;
            console.log(`Daemon status:`);
            console.log(`  PID:              ${state.pid}`);
            console.log(`  Uptime:           ${uptimeStr}`);
            console.log(`  Watched files:    ${state.watched_files}`);
            console.log(`  Pending changes:  ${state.changes_since_regen}`);
            console.log(`  Total regens:     ${state.total_regenerations}`);
            console.log(`  Last scan:        ${state.last_scan}`);
            return;
        }
        // Verify session exists before starting
        try {
            await loadSession(workingDir);
        }
        catch {
            throw new SessionError(ErrorCode.SESSION_NOT_FOUND, 'No active session. Run `handoff init` first before starting the watcher.');
        }
        const alreadyRunning = await isDaemonRunning(workingDir);
        if (alreadyRunning) {
            console.log(`Daemon is already running. Use --status to check or --stop to stop it.`);
            return;
        }
        const config = await loadConfig(workingDir);
        const debounce_ms = Math.max(100, parseInt(options.debounce, 10) || 2000);
        const change_threshold = Math.max(1, parseInt(options.threshold, 10) || 3);
        // -- Foreground mode --
        if (!options.detach) {
            console.log(`Watching ${workingDir} (foreground mode, Ctrl+C to stop)...`);
            const watcher = createWatcher({
                working_dir: workingDir,
                exclude_patterns: config.exclude_patterns,
                debounce_ms,
                auto_regenerate: true,
                change_threshold,
                max_regen_interval_ms: config.daemon?.max_regen_interval_ms ?? 60000,
            }, {
                onFileChange: (path, type) => {
                    console.log(`  ${type === 'unlink' ? 'deleted' : type === 'add' ? 'added' : 'changed'}: ${path}`);
                },
                onRegenerate: (changedPaths) => {
                    console.log(`\nAuto-regenerating HANDOFF.md (${changedPaths.length} changes)...`);
                },
                onError: (err) => {
                    console.error(`Watcher error: ${err.message}`);
                },
            });
            await watcher.start();
            await new Promise((resolve) => {
                process.on('SIGINT', () => {
                    void watcher.stop().then(resolve);
                });
                process.on('SIGTERM', () => {
                    void watcher.stop().then(resolve);
                });
            });
            return;
        }
        // -- Background (daemon) mode --
        const pid = await startDaemon({
            working_dir: workingDir,
            pid_file: join('.handoff', 'daemon.pid'),
            log_file: join('.handoff', 'daemon.log'),
            detach: true,
            debounce_ms,
            change_threshold,
            max_regen_interval_ms: config.daemon?.max_regen_interval_ms ?? 60000,
        });
        console.log(`Watcher daemon started (PID: ${pid})`);
        console.log(`Watching ${workingDir}`);
        console.log(`Logs: ${join(workingDir, '.handoff/daemon.log')}`);
        console.log(`Run \`handoff watch --status\` to check status`);
        console.log(`Run \`handoff watch --stop\` to stop`);
    });
}
//# sourceMappingURL=watch.js.map