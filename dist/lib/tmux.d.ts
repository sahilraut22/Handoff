import type { TmuxPane } from '../types/index.js';
export declare function isTmuxAvailable(): boolean;
export declare function listPanes(): TmuxPane[];
export declare function findPane(identifier: string): TmuxPane | undefined;
export declare function setPaneTitle(title: string, paneId?: string): void;
export declare function sendKeys(paneId: string, text: string): void;
export declare function capturePane(paneId: string): string;
export declare function waitForResponse(paneId: string, timeoutMs: number, pollIntervalMs?: number): Promise<string>;
export declare function hasSession(name: string): boolean;
export declare function newSession(name: string, options?: {
    detached?: boolean;
    startDir?: string;
}): string;
export declare function splitPane(targetPane: string, options?: {
    horizontal?: boolean;
    startDir?: string;
}): string;
export declare function killPane(paneId: string): void;
export declare function killSession(name: string): void;
export declare function selectPane(paneId: string): void;
export declare function selectLayout(layout: string, targetWindow?: string): void;
export declare function attachSession(name: string): void;
export declare function getSessionPanes(sessionName: string): TmuxPane[];
export declare function resizePane(paneId: string, options: {
    height?: number;
    width?: number;
}): void;
export declare function buildTmuxCommand(args: string[]): string;
/**
 * Type literal text into a pane WITHOUT pressing Enter.
 * Uses -l (literal) flag so text is not interpreted as key names.
 */
export declare function typeText(paneId: string, text: string): void;
/**
 * Send one or more special key names to a pane (Enter, Escape, C-c, Tab, Up, etc.).
 * Does NOT use -l so key names are interpreted by tmux.
 */
export declare function sendSpecialKey(paneId: string, ...keys: string[]): void;
/**
 * Type literal text AND submit with Enter.
 * Selects the target pane first so TUI apps (like Codex/ink) have their
 * input handler active before the Enter keystroke arrives — otherwise
 * TUI apps in non-active panes ignore the Enter even if text was typed.
 */
export declare function typeTextAndSubmit(paneId: string, text: string): Promise<void>;
/**
 * Capture the last N lines from a pane's scrollback buffer.
 * Uses negative -S value to capture from the end.
 */
export declare function capturePaneLines(paneId: string, lineCount: number): string;
/**
 * Get the current pane's ID. Checks $TMUX_PANE env var first,
 * falls back to tmux display-message.
 */
export declare function getCurrentPaneId(): string;
/**
 * Get pane dimensions and current working directory.
 */
export declare function getPaneInfo(paneId: string): {
    width: number;
    height: number;
    cwd: string;
} | null;
/**
 * Load a tmux config file into the running server.
 */
export declare function sourceConfig(configPath: string): void;
