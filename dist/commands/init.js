import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles, snapshotAllFiles } from '../lib/snapshot.js';
import { SessionError, FileError, ErrorCode } from '../lib/errors.js';
export function registerInitCommand(program) {
    program
        .command('init')
        .description('Initialize a handoff session. Creates baseline snapshot for change detection.')
        .option('-f, --force', 'Re-initialize without prompt if session exists')
        .option('-d, --dir <path>', 'Target directory (default: current directory)')
        .action(async (options) => {
        const workingDir = resolve(options.dir ?? process.cwd());
        const handoffDir = join(workingDir, '.handoff');
        const snapshotDir = join(handoffDir, 'snapshots');
        // Check if session already exists
        try {
            await access(join(handoffDir, 'session.json'));
            if (!options.force) {
                throw new SessionError(ErrorCode.SESSION_EXPIRED, 'Session already exists.', { recoveryHint: 'Use --force to re-initialize.' });
            }
            // Clean up old session
            await rm(handoffDir, { recursive: true, force: true });
        }
        catch (err) {
            if (err instanceof SessionError)
                throw err;
            // No existing session, proceed
        }
        // Create directories
        try {
            await mkdir(snapshotDir, { recursive: true });
        }
        catch (err) {
            throw new FileError(ErrorCode.FILE_WRITE_ERROR, `Failed to create .handoff directory: ${err.message}`, { cause: err });
        }
        // Load config
        const config = await loadConfig(workingDir);
        // Walk and hash files
        console.log('Scanning files...');
        const files = await walkFiles(workingDir, config.exclude_patterns);
        console.log(`Found ${files.length} files`);
        console.log('Hashing files...');
        const fileHashes = await hashAllFiles(workingDir, files);
        // Snapshot text files for later diffing
        console.log('Creating snapshots...');
        await snapshotAllFiles(workingDir, files, snapshotDir);
        // Write session
        const session = {
            session_id: randomUUID(),
            created_at: new Date().toISOString(),
            working_dir: workingDir,
            file_hashes: fileHashes,
            excluded_patterns: config.exclude_patterns,
        };
        try {
            await writeFile(join(handoffDir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
        }
        catch (err) {
            throw new FileError(ErrorCode.FILE_WRITE_ERROR, `Failed to write session file: ${err.message}`, { cause: err });
        }
        console.log(`\nSession initialized: ${session.session_id}`);
        console.log(`Tracking ${files.length} files in ${workingDir}`);
    });
}
//# sourceMappingURL=init.js.map