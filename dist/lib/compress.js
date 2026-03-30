/**
 * Priority-based compression engine for HANDOFF.md context.
 *
 * v2.1 improvements:
 * - Content-aware priority boosting (keywords in diff override path classification)
 * - Word-based token estimation via tokens.ts
 * - Query-adaptive relevance scoring (--for <query>)
 * - Reference-coherent diff compression (preserve lines referencing critical identifiers)
 */
import { extractChangedNames } from './semantic.js';
import { estimateTokens } from './tokens.js';
import { chunkDiff, selectChunks, scoreChunks, assembleChunks } from './semantic-chunker.js';
import { rankByRelevance } from './tfidf.js';
// --- Path-based priority ---
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
function classifyByPath(path) {
    const lower = path.toLowerCase();
    for (const p of CRITICAL_PATTERNS)
        if (p.test(lower))
            return 'critical';
    for (const p of LOW_PATTERNS)
        if (p.test(lower))
            return 'low';
    for (const p of HIGH_PATTERNS)
        if (p.test(lower))
            return 'high';
    return 'medium';
}
// --- Content-aware boosting ---
const CONTENT_BOOST = [
    {
        boost: 3,
        patterns: [
            /\b(BREAKING|SECURITY|CVE-\d+|VULNERABILITY)\b/i,
            /\b(password|secret|apikey|api_key|private_key|credential)\s*[=:]/i,
            /\b(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\b/i,
            /rm\s+-rf/,
        ],
    },
    {
        boost: 2,
        patterns: [
            /\b(TODO|FIXME|HACK|XXX|BUG)\b/,
            /\b(throw new|panic!|fatal|crash)\b/i,
            /\b(auth|authentication|authorization|permission)\b/i,
            /\b(encrypt|decrypt|hash|sign|verify)\b/i,
        ],
    },
    {
        boost: 1,
        patterns: [
            /\b(deprecated|warning|caution)\b/i,
            /\b(config|configuration|settings|options)\b/i,
        ],
    },
];
const PRIORITY_ORDER = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
};
const PRIORITY_BY_INDEX = ['low', 'medium', 'high', 'critical'];
function boostPriority(current, levels) {
    const idx = Math.min(PRIORITY_ORDER[current] + levels, 3);
    return PRIORITY_BY_INDEX[idx];
}
function getContentBoost(diff) {
    for (const tier of CONTENT_BOOST) {
        for (const pattern of tier.patterns) {
            if (pattern.test(diff))
                return tier.boost;
        }
    }
    return 0;
}
export function classifyPriority(change) {
    let priority = classifyByPath(change.path);
    if (change.diff) {
        const boost = getContentBoost(change.diff);
        if (boost > 0)
            priority = boostPriority(priority, boost);
    }
    return priority;
}
// --- Query-adaptive relevance ---
export const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
    'and', 'or', 'but', 'if', 'then', 'continue', 'implement', 'fix', 'add', 'update',
    'change', 'make', 'please', 'help', 'want', 'need', 'working', 'work', 'use', 'used',
    'using', 'let', 'get', 'set', 'new', 'old', 'also', 'just', 'now', 'here', 'there',
]);
export function extractQueryKeywords(query) {
    const words = query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    // Also extract camelCase / snake_case identifiers from the original query
    const identifiers = (query.match(/[a-zA-Z][a-zA-Z0-9]*(?:[_][a-zA-Z0-9]+)+|[a-z]+(?:[A-Z][a-z]+)+/g) ?? [])
        .map((s) => s.toLowerCase());
    return [...new Set([...words, ...identifiers])];
}
export function scoreQueryRelevance(change, keywords) {
    if (keywords.length === 0)
        return 0;
    const content = (change.path + ' ' + (change.diff ?? '')).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        if (content.includes(kw)) {
            score += 1;
            if (change.path.toLowerCase().includes(kw))
                score += 0.5; // path match bonus
        }
    }
    return Math.min(score / keywords.length, 1);
}
export function adjustPriorityForQuery(change, keywords) {
    const relevance = scoreQueryRelevance(change, keywords);
    if (relevance >= 0.5)
        return boostPriority(change.priority, 2);
    if (relevance >= 0.25)
        return boostPriority(change.priority, 1);
    return change.priority;
}
// --- Identifier extraction for coherent compression ---
export function extractIdentifiers(diff) {
    const ids = new Set();
    const patterns = [
        /(?:function|def|fn|func)\s+(\w+)/g,
        /(?:class|interface|type|struct|trait|contract)\s+(\w+)/g,
        /(?:const|let|var|val)\s+(\w+)\s*=/g,
        /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g,
    ];
    for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(diff)) !== null) {
            if (match[1])
                ids.add(match[1]);
        }
    }
    const noise = new Set(['if', 'else', 'for', 'while', 'return', 'const', 'let', 'var',
        'function', 'class', 'type', 'interface', 'struct', 'trait', 'export', 'import',
        'async', 'await', 'new', 'this', 'super', 'true', 'false', 'null', 'undefined']);
    for (const n of noise)
        ids.delete(n);
    return ids;
}
// --- Reference-coherent diff compression ---
export function compressDiffCoherent(diff, maxLines, criticalIdentifiers) {
    const lines = diff.split('\n');
    if (lines.length <= maxLines)
        return diff;
    const keep = new Array(lines.length).fill(false);
    // Always keep file headers and hunk headers
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('@@') || lines[i].startsWith('---') || lines[i].startsWith('+++')) {
            keep[i] = true;
        }
    }
    // Keep lines with critical identifiers + 1 line context around them
    for (let i = 0; i < lines.length; i++) {
        for (const id of criticalIdentifiers) {
            if (lines[i].includes(id)) {
                keep[i] = true;
                if (i > 0)
                    keep[i - 1] = true;
                if (i < lines.length - 1)
                    keep[i + 1] = true;
                break;
            }
        }
    }
    // Keep declaration lines
    const declPattern = /^[+\- ]?\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|def|fn|func|struct|trait|contract)\s+\w+/;
    for (let i = 0; i < lines.length; i++) {
        if (declPattern.test(lines[i]))
            keep[i] = true;
    }
    // Keep error handling lines
    const errPattern = /\b(throw|catch|Error|reject|panic|fatal)\b/;
    for (let i = 0; i < lines.length; i++) {
        if (errPattern.test(lines[i]))
            keep[i] = true;
    }
    // Build output, inserting omission markers for gaps
    const result = [];
    let omitted = 0;
    for (let i = 0; i < lines.length; i++) {
        if (keep[i]) {
            if (omitted > 0) {
                result.push(`  ... (${omitted} lines omitted)`);
                omitted = 0;
            }
            result.push(lines[i]);
        }
        else {
            omitted++;
        }
    }
    if (omitted > 0)
        result.push(`  ... (${omitted} lines omitted)`);
    if (result.length > maxLines) {
        return result.slice(0, maxLines - 1).join('\n') + '\n  ... (truncated)';
    }
    return result.join('\n');
}
// --- Legacy simple diff compression (used when no identifier context) ---
export function compressDiff(diff, targetLines) {
    const lines = diff.split('\n');
    if (lines.length <= targetLines)
        return diff;
    const result = [];
    let hunkLines = [];
    let inHunk = false;
    const CONTEXT = 2;
    function flushHunk() {
        if (hunkLines.length === 0)
            return;
        const changedIndices = hunkLines
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => l.startsWith('+') || l.startsWith('-'))
            .map(({ i }) => i);
        if (changedIndices.length === 0 || hunkLines.length <= CONTEXT * 2 + changedIndices.length + 3) {
            result.push(...hunkLines);
            hunkLines = [];
            return;
        }
        const keepSet = new Set();
        keepSet.add(0); // hunk header
        for (const idx of changedIndices) {
            for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(hunkLines.length - 1, idx + CONTEXT); k++) {
                keepSet.add(k);
            }
        }
        let prevKept = -1;
        for (let i = 0; i < hunkLines.length; i++) {
            if (keepSet.has(i)) {
                if (prevKept !== -1 && i > prevKept + 1) {
                    result.push(`... (${i - prevKept - 1} lines omitted)`);
                }
                result.push(hunkLines[i]);
                prevKept = i;
            }
        }
        if (prevKept < hunkLines.length - 1) {
            result.push(`... (${hunkLines.length - 1 - prevKept} lines omitted)`);
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
    if (result.length > targetLines) {
        return result.slice(0, targetLines).join('\n') + `\n... (truncated, ${result.length - targetLines} more lines)`;
    }
    return result.join('\n');
}
// --- Main compression function ---
export function compressChanges(changes, options = {}) {
    const tokenBudget = options.token_budget ?? 8000;
    const priorityThreshold = options.priority_threshold ?? 'low';
    const includeFullDiff = options.include_full_diff ?? false;
    const queryKeywords = options.query?.keywords ?? [];
    // Step 1: Classify with content-aware boosting
    const classified = changes.map((change) => {
        let priority = classifyPriority(change);
        // Apply query-adaptive boost if keywords provided
        if (queryKeywords.length > 0) {
            priority = adjustPriorityForQuery({ ...change, priority }, queryKeywords);
        }
        const functions_changed = change.diff ? extractChangedNames(change.diff, change.path) : [];
        let summary;
        if (change.isBinary) {
            summary = `Binary file ${change.type}`;
        }
        else if (change.type === 'deleted') {
            summary = 'File deleted';
        }
        else if (!change.diff) {
            summary = `File ${change.type} (no diff available)`;
        }
        else {
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
    const eligible = classified.filter((c) => PRIORITY_ORDER[c.priority] >= thresholdOrder);
    const omitted = classified.filter((c) => PRIORITY_ORDER[c.priority] < thresholdOrder);
    // Step 3: Sort by priority descending
    const sorted = [...eligible].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    // Step 4: Extract critical identifiers for coherent compression
    const criticalIdentifiers = new Set();
    for (const change of sorted) {
        if (change.priority === 'critical' || change.priority === 'high') {
            if (change.diff) {
                for (const id of extractIdentifiers(change.diff)) {
                    criticalIdentifiers.add(id);
                }
            }
        }
    }
    // Step 5: Allocate token budget by tier
    const budgetAllocation = {
        critical: Math.floor(tokenBudget * 0.45),
        high: Math.floor(tokenBudget * 0.30),
        medium: Math.floor(tokenBudget * 0.18),
        low: Math.floor(tokenBudget * 0.07),
    };
    // Step 4b: Re-rank by TF-IDF if query provided (more accurate than keyword overlap)
    if (queryKeywords.length > 0 && sorted.length > 0) {
        const query = queryKeywords.join(' ');
        const docs = sorted.map((c) => `${c.path} ${c.diff ?? ''} ${c.summary}`);
        const ranked = rankByRelevance(query, docs);
        // Boost priority of top TF-IDF ranked changes
        for (const r of ranked.slice(0, Math.ceil(sorted.length * 0.3))) {
            if (r.score > 0.2) {
                sorted[r.index].priority = boostPriority(sorted[r.index].priority, 1);
            }
        }
        // Re-sort after TF-IDF boost
        sorted.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    }
    const result = [];
    const budgetUsed = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const change of sorted) {
        const tier = change.priority;
        const remaining = budgetAllocation[tier] - budgetUsed[tier];
        if (!change.diff || change.isBinary || change.type === 'deleted' || includeFullDiff) {
            result.push(change);
            budgetUsed[tier] += estimateTokens(change.diff ?? change.summary);
            continue;
        }
        const fullTokens = estimateTokens(change.diff);
        if (fullTokens <= remaining) {
            result.push({ ...change, compressed_diff: change.diff });
            budgetUsed[tier] += fullTokens;
        }
        else if (remaining > 100) {
            // Use semantic chunking for all tiers when we have enough budget
            const diffChunks = chunkDiff(change.diff, change.path);
            const queryStr = queryKeywords.join(' ');
            const scoredChunks = queryStr ? scoreChunks(diffChunks, queryStr) : diffChunks;
            // Mark critical-identifier lines as high importance
            const chunksWithBoost = scoredChunks.map((chunk) => {
                for (const id of criticalIdentifiers) {
                    if (chunk.content.includes(id)) {
                        return { ...chunk, importance: Math.min(1, chunk.importance + 0.3) };
                    }
                }
                return chunk;
            });
            const selected = selectChunks(chunksWithBoost, remaining);
            const totalLines = change.diff.split('\n').length;
            const compressed = assembleChunks(selected, totalLines);
            result.push({ ...change, compressed_diff: compressed });
            budgetUsed[tier] += estimateTokens(compressed);
        }
        else if (remaining > 50) {
            // Fallback to coherent compression for very tight budgets
            const targetChars = remaining * 4;
            const targetLines = Math.max(10, Math.floor(targetChars / 80));
            const compressed = compressDiffCoherent(change.diff, targetLines, criticalIdentifiers);
            result.push({ ...change, compressed_diff: compressed });
            budgetUsed[tier] += estimateTokens(compressed);
        }
        else {
            // Over budget: include summary only
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