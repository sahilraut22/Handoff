/**
 * Technology signature detector.
 * Scans project files (package.json, imports, docker-compose, .env)
 * to build a map of which technology stack is currently in use per category.
 *
 * This enables state-based decision extraction: when the tech stack changes
 * between exports, we can auto-generate a decision recording the switch.
 */
import type { TechSnapshot } from '../types/index.js';
/**
 * Build a complete technology snapshot for the current project state.
 * Combines package.json, imports, docker-compose, .env detection.
 */
export declare function buildTechSnapshot(workingDir: string): Promise<TechSnapshot>;
/**
 * Get the human-readable label for a category.
 */
export declare function getCategoryLabel(category: string): string;
/**
 * Get the tag for a category (for decision tagging).
 */
export declare function getCategoryTag(category: string): string;
