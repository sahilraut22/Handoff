import { extractQueryKeywords } from './compress.js';
// Default decision detection patterns
const DEFAULT_PATTERNS = [
    {
        name: 'architecture-choice',
        trigger: /\b(?:decided|chose|chosen|going with|opted for|picked|selected)\s+(?:to\s+)?(.{10,120})/i,
        context_window: 5,
        confidence_base: 0.7,
        tag: 'architecture',
    },
    {
        name: 'tradeoff',
        trigger: /\b(?:tradeoff|trade-off|tradeoffs|pros and cons|advantages|disadvantages)\b/i,
        context_window: 6,
        confidence_base: 0.75,
        tag: 'tradeoff',
    },
    {
        name: 'breaking-change',
        trigger: /\b(?:BREAKING|breaking change|backward.?incompatible|migration required)\b/i,
        context_window: 4,
        confidence_base: 0.85,
        tag: 'breaking',
    },
    {
        name: 'deprecation',
        trigger: /\b(?:deprecated?|deprecating|replacing|sunset|removing|phasing out)\b/i,
        context_window: 4,
        confidence_base: 0.7,
        tag: 'deprecation',
    },
    {
        name: 'security-decision',
        trigger: /\b(?:security|authentication|authorization|encryption|vulnerability|CVE)\b/i,
        context_window: 5,
        confidence_base: 0.8,
        tag: 'security',
    },
    {
        name: 'performance',
        trigger: /\b(?:performance|optimization|latency|throughput|benchmark|bottleneck)\b/i,
        context_window: 4,
        confidence_base: 0.65,
        tag: 'performance',
    },
    {
        name: 'dependency',
        trigger: /\b(?:added|removed|replaced|upgraded|downgraded)\s+(?:\S+\s+)?(?:dependency|package|library|module)\b/i,
        context_window: 3,
        confidence_base: 0.7,
        tag: 'dependency',
    },
    {
        name: 'instead-of',
        trigger: /\b(?:instead of|rather than|as opposed to|preferred .{1,40} over)\b/i,
        context_window: 5,
        confidence_base: 0.8,
        tag: 'alternative',
    },
    {
        name: 'reason-because',
        trigger: /\b(?:because|since|the reason|rationale|motivation)\b.{10,}/i,
        context_window: 4,
        confidence_base: 0.6,
        tag: 'rationale',
    },
    {
        name: 'todo-decision',
        trigger: /\bTODO\b.*\b(?:decide|consider|evaluate|choose)\b/i,
        context_window: 3,
        confidence_base: 0.5,
        tag: 'pending',
    },
    {
        name: 'remember-to',
        trigger: /\bremember\s+(?:to\s+)?(?:use|always use|always|apply|follow|prefer|avoid|never use|never)\s+.{5,120}/i,
        context_window: 4,
        confidence_base: 0.7,
        tag: 'convention',
    },
];
const DEFAULT_EXTRACTION_CONFIG = {
    min_confidence: 0.5,
    max_decisions_per_scan: 10,
    patterns: DEFAULT_PATTERNS,
};
function splitIntoLines(text) {
    return text.split(/\r?\n/);
}
function extractAlternatives(window) {
    const alternatives = [];
    const joined = window.join(' ');
    // List patterns: "- option A", "1. option A"
    const listMatches = joined.match(/(?:^|\n)\s*[-*\d]+[.)]\s+(.{5,80})/g) ?? [];
    for (const m of listMatches.slice(0, 5)) {
        const clean = m.replace(/^\s*[-*\d]+[.)]\s+/, '').trim();
        if (clean.length >= 5)
            alternatives.push(clean);
    }
    // "option A vs option B" patterns
    const vsMatch = joined.match(/(.{5,40})\s+(?:vs\.?|versus|or)\s+(.{5,40})/i);
    if (vsMatch && alternatives.length === 0) {
        if (vsMatch[1])
            alternatives.push(vsMatch[1].trim());
        if (vsMatch[2])
            alternatives.push(vsMatch[2].trim());
    }
    return alternatives.slice(0, 5);
}
function extractTitle(triggerLine, patternName) {
    // Clean diff markers (+/-) and leading whitespace
    const clean = triggerLine.replace(/^[+-]\s*/, '').replace(/^\/\/\s*/, '').trim();
    // Take up to 80 chars, trim at word boundary
    if (clean.length <= 80)
        return clean;
    const truncated = clean.slice(0, 80);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated) + '...';
}
function computeConfidence(base, window, triggerLine) {
    let confidence = base;
    const joined = window.join(' ').toLowerCase();
    // Boost for explicit alternatives
    if (/\b(?:instead of|rather than|as opposed to|vs\.?|versus|over)\b/.test(joined)) {
        confidence += 0.1;
    }
    // Boost for rationale
    if (/\b(?:because|since|the reason|rationale|therefore|thus)\b/.test(joined)) {
        confidence += 0.1;
    }
    // Boost for file paths or function names
    if (/[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z]+){1,3}/.test(joined)) {
        confidence += 0.05;
    }
    // Penalize very short trigger lines
    if (triggerLine.trim().length < 30)
        confidence -= 0.1;
    // Penalize comment-only lines (aspirational, not actual decision)
    if (/^[+-]?\s*(?:\/\/|#|\/\*)/.test(triggerLine))
        confidence -= 0.15;
    return Math.max(0, Math.min(1, confidence));
}
function deduplicateExtracted(decisions) {
    const seen = new Map();
    for (const d of decisions) {
        // Normalize title for comparison
        const words = extractQueryKeywords(d.title);
        const key = words.sort().join('-');
        const existing = seen.get(key);
        if (!existing || d.confidence > existing.confidence) {
            seen.set(key, d);
        }
    }
    return [...seen.values()];
}
export function extractDecisions(text, source, config) {
    const cfg = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
    if (config?.patterns)
        cfg.patterns = config.patterns;
    const lines = splitIntoLines(text);
    const results = [];
    const seenLineIndices = new Set();
    for (const pattern of cfg.patterns) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!pattern.trigger.test(line))
                continue;
            if (seenLineIndices.has(i))
                continue;
            // Capture context window
            const start = Math.max(0, i - pattern.context_window);
            const end = Math.min(lines.length - 1, i + pattern.context_window);
            const windowLines = lines.slice(start, end + 1);
            const title = extractTitle(line, pattern.name);
            if (!title || title.length < 10)
                continue;
            const confidence = computeConfidence(pattern.confidence_base, windowLines, line);
            if (confidence < cfg.min_confidence)
                continue;
            const alternatives = extractAlternatives(windowLines);
            const tags = [];
            if (pattern.tag)
                tags.push(pattern.tag);
            // Build context from surrounding lines (exclude diff markers for cleanliness)
            const contextLines = windowLines
                .filter((l) => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@'))
                .map((l) => l.replace(/^[+\-] ?/, '').trim())
                .filter((l) => l.length > 0);
            results.push({
                title,
                context: contextLines.slice(0, 8).join(' ').slice(0, 500),
                decision: title,
                alternatives,
                confidence,
                source,
                tags,
            });
            // Mark surrounding lines as processed to avoid duplicate triggers
            for (let j = start; j <= end; j++)
                seenLineIndices.add(j);
            if (results.length >= cfg.max_decisions_per_scan)
                break;
        }
        if (results.length >= cfg.max_decisions_per_scan)
            break;
    }
    return deduplicateExtracted(results).slice(0, cfg.max_decisions_per_scan);
}
export function mergeExtracted(existingTitles, extracted) {
    const normalizedExisting = existingTitles.map((t) => new Set(extractQueryKeywords(t.toLowerCase())));
    let duplicates = 0;
    const new_decisions = [];
    for (const d of extracted) {
        const dWords = new Set(extractQueryKeywords(d.title.toLowerCase()));
        let isDuplicate = false;
        for (const existing of normalizedExisting) {
            // Jaccard similarity
            const intersection = [...dWords].filter((w) => existing.has(w)).length;
            const union = new Set([...dWords, ...existing]).size;
            const jaccard = union > 0 ? intersection / union : 0;
            if (jaccard >= 0.7) {
                isDuplicate = true;
                break;
            }
        }
        if (isDuplicate) {
            duplicates++;
        }
        else {
            new_decisions.push(d);
        }
    }
    return { new_decisions, duplicates };
}
export function formatExtractedForReview(decisions) {
    if (decisions.length === 0)
        return 'No decisions extracted.';
    const lines = ['Extracted Decisions:', ''];
    for (const d of decisions) {
        const pct = Math.round(d.confidence * 100);
        lines.push(`[${pct}% confidence] ${d.title}`);
        lines.push(`  Source: ${d.source}${d.source_location ? ` (${d.source_location})` : ''}`);
        lines.push(`  Tags: ${d.tags.join(', ') || 'none'}`);
        if (d.alternatives.length > 0) {
            lines.push(`  Alternatives: ${d.alternatives.join(', ')}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
export { DEFAULT_PATTERNS, DEFAULT_EXTRACTION_CONFIG };
//# sourceMappingURL=decision-extractor.js.map