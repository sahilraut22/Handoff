/**
 * State-based decision extraction.
 *
 * Detects architectural decisions from project state changes rather than
 * diffs or commit messages. Compares the current technology stack against
 * the previously recorded state and generates decisions for any switches.
 *
 * Example: if package.json previously had `mongodb` and now has `mysql2`,
 * this generates: "Switch database from mongodb to mysql2"
 * The full lineage (mongodb → couchdb → mysql2) is preserved in history
 * and surfaces in the decision's alternatives list.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildTechSnapshot, getCategoryLabel, getCategoryTag } from './tech-detector.js';
import type { TechSnapshot, TechStateHistory, ExtractedDecision } from '../types/index.js';

const STATE_FILE = '.handoff/tech-state.json';

export async function loadTechState(workingDir: string): Promise<TechStateHistory | null> {
  try {
    const content = await readFile(join(workingDir, STATE_FILE), 'utf-8');
    return JSON.parse(content) as TechStateHistory;
  } catch {
    return null;
  }
}

export async function saveTechState(workingDir: string, state: TechStateHistory): Promise<void> {
  await mkdir(join(workingDir, '.handoff'), { recursive: true });
  await writeFile(join(workingDir, STATE_FILE), JSON.stringify(state, null, 2), 'utf-8');
}

interface TechDiff {
  category: string;
  added: string[];
  removed: string[];
  /** All techs ever seen in this category (oldest first), for lineage */
  history: string[];
}

/**
 * Compare two tech snapshots and return what changed per category.
 * Only returns categories where something actually changed.
 */
function diffSnapshots(prev: TechSnapshot, curr: TechSnapshot, history: Record<string, string[]>): TechDiff[] {
  const diffs: TechDiff[] = [];
  const allCats = new Set([...Object.keys(prev.techs), ...Object.keys(curr.techs)]);

  for (const cat of allCats) {
    const prevSet = new Set(prev.techs[cat] ?? []);
    const currSet = new Set(curr.techs[cat] ?? []);

    const added = [...currSet].filter((t) => !prevSet.has(t));
    const removed = [...prevSet].filter((t) => !currSet.has(t));

    if (added.length === 0 && removed.length === 0) continue;

    diffs.push({
      category: cat,
      added,
      removed,
      history: history[cat] ?? [],
    });
  }

  return diffs;
}

/**
 * Update the history record with the new snapshot's techs.
 * History is per-category: all techs ever seen, oldest first, deduplicated.
 */
function updateHistory(history: Record<string, string[]>, snapshot: TechSnapshot): Record<string, string[]> {
  const updated = { ...history };
  for (const [cat, techs] of Object.entries(snapshot.techs)) {
    const existing = new Set(updated[cat] ?? []);
    for (const t of techs) {
      if (!existing.has(t)) {
        updated[cat] = [...(updated[cat] ?? []), t];
        existing.add(t);
      }
    }
  }
  return updated;
}

/**
 * Format a list of tech names for human display.
 * e.g. ['mongodb', 'mongoose'] → "MongoDB, Mongoose"
 */
function formatTechList(techs: string[]): string {
  return techs.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
}

/**
 * Generate ExtractedDecision objects from a list of tech diffs.
 */
function buildDecisions(diffs: TechDiff[]): ExtractedDecision[] {
  const decisions: ExtractedDecision[] = [];

  for (const diff of diffs) {
    const label = getCategoryLabel(diff.category);
    const tag = getCategoryTag(diff.category);

    // Full lineage: history (not including current) + added
    const previousTechs = diff.history.filter((t) => !diff.added.includes(t));

    if (diff.added.length > 0 && diff.removed.length > 0) {
      // Clear switch: removed old, added new
      const title = `Switch ${label} from ${formatTechList(diff.removed)} to ${formatTechList(diff.added)}`;

      const lineage = previousTechs.length > 0
        ? ` Previously used: ${formatTechList(previousTechs)}.`
        : '';

      decisions.push({
        title,
        context: `Detected state change in ${label}: ${formatTechList(diff.removed)} removed, ${formatTechList(diff.added)} added from project files.${lineage}`,
        decision: `Use ${formatTechList(diff.added)} for ${label}.`,
        alternatives: [
          ...diff.removed.map((t) => `${t} (removed)`),
          ...previousTechs.filter((t) => !diff.removed.includes(t)).map((t) => `${t} (previously used)`),
        ],
        confidence: 0.8,
        source: 'state',
        source_location: 'package.json / imports',
        tags: [tag, diff.category],
      });
    } else if (diff.added.length > 0) {
      // New tech introduced, nothing removed
      const title = `Adopt ${formatTechList(diff.added)} for ${label}`;

      const context = previousTechs.length > 0
        ? `Added ${formatTechList(diff.added)} to the project. Previously used: ${formatTechList(previousTechs)}.`
        : `Added ${formatTechList(diff.added)} to the project as the ${label} choice.`;

      decisions.push({
        title,
        context,
        decision: `Use ${formatTechList(diff.added)} for ${label}.`,
        alternatives: previousTechs.map((t) => `${t} (previously used)`),
        confidence: previousTechs.length > 0 ? 0.8 : 0.65,
        source: 'state',
        source_location: 'package.json / imports',
        tags: [tag, diff.category],
      });
    } else if (diff.removed.length > 0) {
      // Tech removed with nothing replacing it
      const title = `Remove ${formatTechList(diff.removed)} (${label})`;

      decisions.push({
        title,
        context: `Removed ${formatTechList(diff.removed)} from the project. No replacement ${label} added yet.`,
        decision: `Removed ${formatTechList(diff.removed)} from the ${label} stack.`,
        alternatives: [],
        confidence: 0.6,
        source: 'state',
        source_location: 'package.json / imports',
        tags: [tag, diff.category],
      });
    }
  }

  return decisions;
}

/**
 * Run a full state detection cycle:
 * 1. Build current tech snapshot from project files
 * 2. Load previous state (if any)
 * 3. Diff and generate decisions
 * 4. Update and persist the state history
 *
 * Returns generated decisions (may be empty if nothing changed).
 */
export async function runStateDetection(workingDir: string): Promise<ExtractedDecision[]> {
  const current = await buildTechSnapshot(workingDir);

  // Nothing detected — no point comparing
  if (Object.keys(current.techs).length === 0) return [];

  const savedState = await loadTechState(workingDir);

  if (!savedState) {
    // First run — just record the baseline, no decisions to generate
    const initial: TechStateHistory = {
      history: updateHistory({}, current),
      last: current,
    };
    await saveTechState(workingDir, initial);
    return [];
  }

  const diffs = diffSnapshots(savedState.last, current, savedState.history);
  const decisions = buildDecisions(diffs);

  // Always update state with latest snapshot and extended history
  const newHistory = updateHistory(savedState.history, current);
  await saveTechState(workingDir, { history: newHistory, last: current });

  return decisions;
}
