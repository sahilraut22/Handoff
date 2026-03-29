export declare function recordRead(callerPaneId: string, targetPaneId: string): Promise<void>;
export declare function checkReadGuard(callerPaneId: string, targetPaneId: string): Promise<boolean>;
export declare function clearReadGuard(): Promise<void>;
