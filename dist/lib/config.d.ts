import type { HandoffConfig } from '../types/index.js';
declare const DEFAULT_CONFIG: HandoffConfig;
export declare function loadConfig(workingDir: string): Promise<HandoffConfig>;
export { DEFAULT_CONFIG };
