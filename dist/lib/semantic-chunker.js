/**
 * Semantic chunking: splits diffs and source code into function-level chunks
 * rather than arbitrary line counts.
 *
 * Uses entity ranges from semantic.ts to identify boundaries, then selects
 * chunks within a token budget using importance scoring from tfidf.ts.
 */
import { extractEntityRanges, detectLanguage } from './semantic.js';
import { countTokens, truncateToTokens } from './tokens.js';
import { summarizeDiff } from './textrank.js';
import { scoreRelevance, buildCorpus, computeTfIdf } from './tfidf.js';
/**
 * Split source code into semantic chunks based on entity boundaries.
 */
export function chunkCode(content, language) {
    const lines = content.split('\n');
    const ranges = extractEntityRanges(content, language);
    const chunks = [];
    // Sort ranges by start_line
    ranges.sort((a, b) => a.start_line - b.start_line);
    let covered = 0; // tracks lines covered by entity ranges
    // Add import/header block (lines before first entity)
    const firstEntityLine = ranges[0]?.start_line ?? lines.length;
    if (firstEntityLine > 0) {
        const headerContent = lines.slice(0, firstEntityLine).join('\n').trim();
        if (headerContent) {
            const isImport = headerContent.includes('import ') || headerContent.includes('require(');
            chunks.push({
                content: headerContent,
                type: isImport ? 'import' : 'other',
                start_line: 0,
                end_line: firstEntityLine - 1,
                token_count: countTokens(headerContent),
                importance: 0.2,
            });
        }
        covered = firstEntityLine;
    }
    // Add entity chunks
    for (const range of ranges) {
        // Add gap content between entities as "other" chunk
        if (range.start_line > covered) {
            const gapContent = lines.slice(covered, range.start_line).join('\n').trim();
            if (gapContent) {
                chunks.push({
                    content: gapContent,
                    type: 'other',
                    start_line: covered,
                    end_line: range.start_line - 1,
                    token_count: countTokens(gapContent),
                    importance: 0.1,
                });
            }
        }
        const entityContent = lines.slice(range.start_line, range.end_line + 1).join('\n');
        const entityType = range.entity.type;
        let chunkType = 'other';
        if (entityType === 'function' || entityType === 'method')
            chunkType = 'function';
        else if (entityType === 'class')
            chunkType = 'class';
        else if (entityType === 'interface' || entityType === 'type')
            chunkType = 'interface';
        chunks.push({
            content: entityContent,
            type: chunkType,
            name: range.entity.name,
            start_line: range.start_line,
            end_line: range.end_line,
            token_count: countTokens(entityContent),
            importance: 0.5, // base importance, updated by caller if query provided
        });
        covered = range.end_line + 1;
    }
    // Add trailing content
    if (covered < lines.length) {
        const trailingContent = lines.slice(covered).join('\n').trim();
        if (trailingContent) {
            chunks.push({
                content: trailingContent,
                type: 'other',
                start_line: covered,
                end_line: lines.length - 1,
                token_count: countTokens(trailingContent),
                importance: 0.1,
            });
        }
    }
    return chunks;
}
/**
 * Split a unified diff into semantic chunks (per-entity diffs).
 * Groups consecutive hunks that modify the same entity together.
 */
export function chunkDiff(diff, filePath) {
    if (!diff.trim())
        return [];
    const language = detectLanguage(filePath);
    const lines = diff.split('\n');
    const chunks = [];
    const hunks = [];
    let current = null;
    for (const line of lines) {
        if (line.startsWith('@@')) {
            if (current)
                hunks.push(current);
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            const startOld = match ? parseInt(match[1], 10) : 0;
            current = { header: line, start_old: startOld, lines: [line] };
        }
        else if (current) {
            current.lines.push(line);
        }
    }
    if (current)
        hunks.push(current);
    if (hunks.length === 0) {
        // No hunks -- treat whole diff as one chunk
        const content = diff;
        return [{
                content,
                type: 'block',
                start_line: 0,
                end_line: lines.length - 1,
                token_count: countTokens(content),
                importance: 0.5,
            }];
    }
    if (language === 'unknown') {
        // No semantic info -- one chunk per hunk
        return hunks.map((hunk) => {
            const content = hunk.lines.join('\n');
            return {
                content,
                type: 'block',
                start_line: hunk.start_old,
                end_line: hunk.start_old + hunk.lines.length,
                token_count: countTokens(content),
                importance: 0.5,
            };
        });
    }
    // Group hunks by entity they fall within (using hunk start line)
    // For now, each hunk is its own chunk with entity name extracted from content
    for (const hunk of hunks) {
        const content = hunk.lines.join('\n');
        // Try to find entity name from hunk header (e.g., "@@ ... @@ function foo")
        const funcMatch = hunk.header.match(/@@ .* @@ (?:function|class|def)\s+(\w+)/);
        const name = funcMatch?.[1];
        chunks.push({
            content,
            type: 'block',
            name,
            start_line: hunk.start_old,
            end_line: hunk.start_old + hunk.lines.length,
            token_count: countTokens(content),
            importance: 0.5,
        });
    }
    return chunks;
}
/**
 * Score chunks by relevance to a query using TF-IDF.
 */
export function scoreChunks(chunks, query) {
    if (!query || chunks.length === 0)
        return chunks;
    const corpus = buildCorpus([query, ...chunks.map((c) => c.content)]);
    const queryVec = computeTfIdf(query, corpus);
    return chunks.map((chunk) => {
        const chunkVec = computeTfIdf(chunk.content, corpus);
        // Compute cosine similarity manually (avoid circular imports)
        let dot = 0;
        for (const [term, w] of queryVec.terms) {
            const cw = chunkVec.terms.get(term);
            if (cw !== undefined)
                dot += w * cw;
        }
        const sim = dot / (queryVec.magnitude * chunkVec.magnitude);
        return { ...chunk, importance: Math.max(chunk.importance, sim) };
    });
}
/**
 * Select chunks within a token budget, prioritized by importance.
 * Uses a greedy approach -- always includes the most important chunks first.
 */
export function selectChunks(chunks, tokenBudget) {
    if (chunks.length === 0)
        return [];
    // Sort by importance descending, but keep import/header blocks always
    const always = chunks.filter((c) => c.type === 'import');
    const prioritized = chunks.filter((c) => c.type !== 'import')
        .sort((a, b) => b.importance - a.importance);
    const selected = [...always];
    let usedTokens = always.reduce((sum, c) => sum + c.token_count, 0);
    for (const chunk of prioritized) {
        if (usedTokens + chunk.token_count <= tokenBudget) {
            selected.push(chunk);
            usedTokens += chunk.token_count;
        }
        else {
            const remaining = tokenBudget - usedTokens;
            if (remaining > 50 && chunk.importance > 0.3) {
                // Try to compress this chunk to fit
                const compressed = chunk.type === 'block' || chunk.type === 'function'
                    ? summarizeDiff(chunk.content, Math.max(5, Math.floor(remaining / 10)))
                    : truncateToTokens(chunk.content, remaining);
                const compressedTokens = countTokens(compressed);
                if (compressedTokens <= remaining) {
                    selected.push({ ...chunk, content: compressed, token_count: compressedTokens });
                    usedTokens += compressedTokens;
                }
            }
        }
    }
    // Re-sort selected chunks by original line order
    return selected.sort((a, b) => a.start_line - b.start_line);
}
/**
 * Reassemble selected chunks into a coherent output string.
 * Inserts omission markers for gaps.
 */
export function assembleChunks(chunks, totalLines) {
    if (chunks.length === 0)
        return '';
    const sorted = [...chunks].sort((a, b) => a.start_line - b.start_line);
    const parts = [];
    let lastEnd = -1;
    for (const chunk of sorted) {
        const gap = chunk.start_line - lastEnd - 1;
        if (lastEnd >= 0 && gap > 2) {
            parts.push(`  ... (${gap} lines omitted)`);
        }
        parts.push(chunk.content);
        lastEnd = chunk.end_line;
    }
    const trailingGap = totalLines - lastEnd - 1;
    if (trailingGap > 2) {
        parts.push(`  ... (${trailingGap} lines omitted)`);
    }
    return parts.join('\n');
}
export { scoreRelevance };
//# sourceMappingURL=semantic-chunker.js.map