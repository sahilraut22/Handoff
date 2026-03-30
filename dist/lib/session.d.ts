import type { Session } from '../types/index.js';
export declare function loadSession(workingDir: string): Promise<Session>;
export declare function saveSession(workingDir: string, session: Session): Promise<void>;
