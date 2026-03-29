import type { HandoffContext } from '../types/index.js';
declare function formatDuration(startIso: string): string;
declare function truncateDiff(diff: string, maxLines: number): string;
export declare function generateHandoffMarkdown(context: HandoffContext): string;
export { formatDuration, truncateDiff };
