import type { TmuxConfig } from '../types/index.js';
export declare function getConfigPath(): string;
export declare function generateTmuxConfig(options?: Partial<TmuxConfig>): string;
export declare function installTmuxConfig(options?: Partial<TmuxConfig>): Promise<string>;
