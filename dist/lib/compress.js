/**
 * Priority-based compression engine for HANDOFF.md context.
 * Classifies changes by importance, compresses diffs to fit within a token budget,
 * and enriches changes with semantic summaries.
 */
import { extractChangedNames } from './semantic.js';
// --- Priority classification ---
const CRITICAL_PATTERNS = [
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /tsconfig.*\.json$/,
    /\.env$/,
    /\.env\./,
    /auth/i,
    /crypto/i,
    /security/i,
    /secret/i,
    /password/i,
    /token/i,
    /\.github\//,
    /migrations?\//,
    /migration/i,
    /docker-compose/i,
    /dockerfile/i,
    /nginx\.conf/,
    /webpack\.config/,
    /vite\.config/,
];
const HIGH_PATTERNS = [
    /src\/lib\//,
    /src\/core\//,
    /src\/api\//,
    /src\/routes?\//,
    /src\/controllers?\//,
    /src\/services?\//,
    /src\/models?\//,
    /\.test\./,
    /\.spec\./,
    /index\.(ts|js)$/,
    /main\.(ts|js)$/,
    /app\.(ts|js)$/,
    /server\.(ts|js)$/,
];
const LOW_PATTERNS = [
    /\.md$/,
    /\.txt$/,
    /\.lock$/,
    /dist\//,
    /build\//,
    /\.min\./,
    /vendor\//,
    /\.generated\./,
    /CHANGELOG/i,
    /LICENSE/i,
    /\.snap$/,
];
export function classifyPriority(change) {
    const path = change.path.toLowerCase();
    for (const pattern of CRITICAL_PATTERNS) {
        if (pattern.test(path))
            return 'critical';
    }
    for (const pattern of LOW_PATTERNS) {
        if (pattern.test(path))
            return 'low';
    }
    for (const pattern of HIGH_PATTERNS) {
        if (pattern.test(path))
            return 'high';
    }
    return 'medium';
}
// --- Token estimation ---
export function estimateTokens(text) {
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(text.length / 4);
}
// --- Diff compression ---
/**
 * Smart diff compression: preserves hunk headers and key lines per hunk,
 * elides unimportant middle lines.
 */
export function compressDiff(diff, targetLines) {
    const lines = diff.split('\n');
    if (lines.length <= targetLines)
        return diff;
    const result = [];
    let hunkLines = [];
    let inHunk = false;
    function flushHunk() {
        if (hunkLines.length === 0)
            return;
        const CONTEXT = 2; // context lines to keep around changed lines
        // Find indices of all changed lines (+/-)
        const changedIndices = hunkLines
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => l.startsWith('+') || l.startsWith('-'))
            .map(({ i }) => i);
        if (changedIndices.length === 0 || hunkLines.length <= CONTEXT * 2 + changedIndices.length + 3) {
            // Small hunk or no changes -- output as-is
            result.push(...hunkLines);
            hunkLines = [];
            return;
        }
        // Build a set of line indices to keep: hunk header (index 0) + changed lines + CONTEXT around them
        const keepSet = new Set();
        keepSet.add(0); // Always keep the @@ header
        for (const idx of changedIndices) {
            for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(hunkLines.length - 1, idx + CONTEXT); k++) {
                keepSet.add(k);
            }
        }
        // Output hunk, inserting "... (N lines omitted)" for gaps
        let prevKept = -1;
        for (let i = 0; i < hunkLines.length; i++) {
            if (keepSet.has(i)) {
                if (prevKept !== -1 && i > prevKept + 1) {
                    const omittedCount = i - prevKept - 1;
                    result.push(`... (${omittedCount} lines omitted)`);
                }
                result.push(hunkLines[i]);
                prevKept = i;
            }
        }
        // Trailing omission
        if (prevKept < hunkLines.length - 1) {
            const remaining = hunkLines.length - 1 - prevKept;
            result.push(`... (${remaining} lines omitted)`);
        }
        hunkLines = [];
    }
    for (const line of lines) {
        if (line.startsWith('@@')) {
            flushHunk();
            inHunk = true;
            hunkLines = [line];
        }
        else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
            flushHunk();
            inHunk = false;
            result.push(line);
        }
        else if (inHunk) {
            hunkLines.push(line);
        }
        else {
            result.push(line);
        }
    }
    flushHunk();
    // If still over budget, hard truncate
    if (result.length > targetLines) {
        return result.slice(0, targetLines).join('\n') + `\n... (truncated, ${result.length - targetLines} more lines)`;
    }
    return result.join('\n');
}
// --- Priority ordering ---
const PRIORITY_ORDER = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
// --- Main compression function ---
export function compressChanges(changes, options = {}) {
    const tokenBudget = options.token_budget ?? 8000;
    const priorityThreshold = options.priority_threshold ?? 'low';
    const includeFullDiff = options.include_full_diff ?? false;
    // Step 1: Classify and enrich
    const classified = changes.map((change) => {
        const priority = classifyPriority(change);
        const functions_changed = change.diff ? extractChangedNames(change.diff, change.path) : [];
        let summary;
        if (change.isBinary) {
            summary = `Binary file ${change.type}`;
        }
        else if (change.type === 'deleted') {
            summary = `File deleted`;
        }
        else if (!change.diff) {
            summary = `File ${change.type} (no diff available)`;
        }
        else {
            // Generate semantic summary for non-binary text changes
            const linesInfo = change.linesAdded || change.linesRemoved
                ? ` (+${change.linesAdded ?? 0}/-${change.linesRemoved ?? 0} lines)`
                : '';
            if (functions_changed.length > 0) {
                summary = `${change.type === 'modified' ? 'Modified' : 'Added'}: ${functions_changed.slice(0, 5).map((n) => `\`${n}\``).join(', ')}${functions_changed.length > 5 ? ` +${functions_changed.length - 5} more` : ''}${linesInfo}`;
            }
            else {
                summary = `${change.type === 'modified' ? 'Modified' : 'Added'} file${linesInfo}`;
            }
        }
        return {
            ...change,
            priority,
            summary,
            functions_changed: functions_changed.length > 0 ? functions_changed : undefined,
        };
    });
    // Step 2: Filter by threshold
    const thresholdOrder = PRIORITY_ORDER[priorityThreshold];
    const eligible = classified.filter((c) => PRIORITY_ORDER[c.priority] <= thresholdOrder);
    const omitted = classified.filter((c) => PRIORITY_ORDER[c.priority] > thresholdOrder);
    // Step 3: Sort by priority
    const sorted = [...eligible].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    // Step 4: Allocate token budget
    const budgetAllocation = {
        critical: Math.floor(tokenBudget * 0.45),
        high: Math.floor(tokenBudget * 0.30),
        medium: Math.floor(tokenBudget * 0.18),
        low: Math.floor(tokenBudget * 0.07),
    };
    const result = [];
    const budgetUsed = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const change of sorted) {
        const tier = change.priority;
        const remaining = budgetAllocation[tier] - budgetUsed[tier];
        if (!change.diff || change.isBinary || change.type === 'deleted' || includeFullDiff) {
            result.push(change);
            const tokenCost = estimateTokens(change.diff ?? change.summary);
            budgetUsed[tier] += tokenCost;
            continue;
        }
        const fullTokens = estimateTokens(change.diff);
        if (fullTokens <= remaining) {
            // Fits in budget: include full diff
            result.push({ ...change, compressed_diff: change.diff });
            budgetUsed[tier] += fullTokens;
        }
        else if (remaining > 50) {
            // Compress to fit remaining budget
            const targetChars = remaining * 4;
            const targetLines = Math.max(10, Math.floor(targetChars / 80));
            const compressed = compressDiff(change.diff, targetLines);
            const compressedTokens = estimateTokens(compressed);
            result.push({ ...change, compressed_diff: compressed });
            budgetUsed[tier] += compressedTokens;
        }
        else {
            // No budget left in this tier: include summary only (no diff)
            result.push({ ...change, compressed_diff: undefined });
        }
    }
    const totalTokensUsed = Object.values(budgetUsed).reduce((a, b) => a + b, 0);
    return {
        changes: result,
        stats: {
            total_changes: classified.length,
            included_changes: result.length,
            omitted_changes: omitted.length,
            estimated_tokens: totalTokensUsed,
            budget_used_pct: Math.round((totalTokensUsed / tokenBudget) * 100),
        },
    };
}
//# sourceMappingURL=compress.js.map