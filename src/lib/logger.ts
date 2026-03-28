import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { QueryLogEntry } from '../types/index.js';

export async function appendQueryLog(workingDir: string, entry: QueryLogEntry): Promise<void> {
  const logPath = join(workingDir, '.handoff', 'queries.log');
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
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
