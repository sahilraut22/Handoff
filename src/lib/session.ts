import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionError, FileError, ErrorCode } from './errors.js';
import type { Session } from '../types/index.js';

export async function loadSession(workingDir: string): Promise<Session> {
  const sessionPath = join(workingDir, '.handoff', 'session.json');
  try {
    const content = await readFile(sessionPath, 'utf-8');
    return JSON.parse(content) as Session;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SessionError(ErrorCode.SESSION_NOT_FOUND,
        'No active session found.',
        { recoveryHint: "Run `handoff init` to start a new session." });
    }
    throw new FileError(ErrorCode.FILE_READ_ERROR,
      `Failed to read session: ${(err as Error).message}`,
      { cause: err as Error });
  }
}

export async function saveSession(workingDir: string, session: Session): Promise<void> {
  const sessionPath = join(workingDir, '.handoff', 'session.json');
  try {
    await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  } catch (err) {
    throw new FileError(ErrorCode.FILE_WRITE_ERROR,
      `Failed to write session: ${(err as Error).message}`,
      { cause: err as Error });
  }
}
