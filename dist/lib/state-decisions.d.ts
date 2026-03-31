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
import type { TechStateHistory, ExtractedDecision } from '../types/index.js';
export declare function loadTechState(workingDir: string): Promise<TechStateHistory | null>;
export declare function saveTechState(workingDir: string, state: TechStateHistory): Promise<void>;
/**
 * Run a full state detection cycle:
 * 1. Build current tech snapshot from project files
 * 2. Load previous state (if any)
 * 3. Diff and generate decisions
 * 4. Update and persist the state history
 *
 * Returns generated decisions (may be empty if nothing changed).
 */
export declare function runStateDetection(workingDir: string): Promise<ExtractedDecision[]>;
