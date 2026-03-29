import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const GUARD_FILE = join(homedir(), '.handoff', 'read-guard.json');
const GUARD_TTL_MS = 60_000; // 60 seconds

interface ReadGuardEntry {
  callerPaneId: string;
  targetPaneId: string;
  timestamp: number;
}

interface ReadGuardState {
  entries: ReadGuardEntry[];
}

async function loadState(): Promise<ReadGuardState> {
  try {
    const content = await readFile(GUARD_FILE, 'utf-8');
    return JSON.parse(content) as ReadGuardState;
  } catch {
    return { entries: [] };
  }
}

async function saveState(state: ReadGuardState): Promise<void> {
  const dir = join(homedir(), '.handoff');
  await mkdir(dir, { recursive: true });
  await writeFile(GUARD_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function pruneExpired(entries: ReadGuardEntry[]): ReadGuardEntry[] {
  const cutoff = Date.now() - GUARD_TTL_MS;
  return entries.filter((e) => e.timestamp > cutoff);
}

export async function recordRead(callerPaneId: string, targetPaneId: string): Promise<void> {
  const state = await loadState();
  state.entries = pruneExpired(state.entries);
  // Remove existing entry for this pair
  state.entries = state.entries.filter(
    (e) => !(e.callerPaneId === callerPaneId && e.targetPaneId === targetPaneId)
  );
  state.entries.push({ callerPaneId, targetPaneId, timestamp: Date.now() });
  await saveState(state);
}

export async function checkReadGuard(callerPaneId: string, targetPaneId: string): Promise<boolean> {
  const state = await loadState();
  const cutoff = Date.now() - GUARD_TTL_MS;
  return state.entries.some(
    (e) =>
      e.callerPaneId === callerPaneId &&
      e.targetPaneId === targetPaneId &&
      e.timestamp > cutoff
  );
}

export async function clearReadGuard(): Promise<void> {
  await saveState({ entries: [] });
}
