import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionError, FileError, ErrorCode } from './errors.js';
export async function loadSession(workingDir) {
    const sessionPath = join(workingDir, '.handoff', 'session.json');
    try {
        const content = await readFile(sessionPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new SessionError(ErrorCode.SESSION_NOT_FOUND, 'No active session found.', { recoveryHint: "Run `handoff init` to start a new session." });
        }
        throw new FileError(ErrorCode.FILE_READ_ERROR, `Failed to read session: ${err.message}`, { cause: err });
    }
}
export async function saveSession(workingDir, session) {
    const sessionPath = join(workingDir, '.handoff', 'session.json');
    try {
        await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    }
    catch (err) {
        throw new FileError(ErrorCode.FILE_WRITE_ERROR, `Failed to write session: ${err.message}`, { cause: err });
    }
}
//# sourceMappingURL=session.js.map