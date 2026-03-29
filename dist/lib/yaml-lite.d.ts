/**
 * Minimal YAML serializer/deserializer for the Decision type.
 * Supports: string fields, optional string arrays, quoted values, multiline strings (literal block scalar).
 * No external dependencies -- handles the Decision schema only.
 */
import type { Decision } from '../types/index.js';
export declare function serializeDecision(d: Decision): string;
export declare function parseDecision(yaml: string): Decision;
