import { formatDecisionMarkdown } from './decisions.js';
function formatDuration(startIso) {
    const startMs = new Date(startIso).getTime();
    const nowMs = Date.now();
    const diffMs = nowMs - startMs;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m`;
    }
    return `${seconds}s`;
}
function truncateDiff(diff, maxLines) {
    const lines = diff.split('\n');
    if (lines.length <= maxLines)
        return diff;
    return lines.slice(0, maxLines).join('\n') + `\n\n(truncated - showing first ${maxLines} of ${lines.length} lines)`;
}
function renderChangeSummary(changes) {
    const modified = changes.filter((c) => c.type === 'modified');
    const added = changes.filter((c) => c.type === 'added');
    const deleted = changes.filter((c) => c.type === 'deleted');
    return `**${modified.length} files modified, ${added.length} files added, ${deleted.length} files deleted**`;
}
function renderFileTable(changes, type) {
    const filtered = changes.filter((c) => c.type === type);
    if (filtered.length === 0)
        return '(none)\n';
    if (type === 'deleted') {
        return filtered.map((c) => `- \`${c.path}\``).join('\n') + '\n';
    }
    if (type === 'added') {
        return filtered.map((c) => {
            if (c.isBinary)
                return `- \`${c.path}\` [binary file]`;
            return `- \`${c.path}\``;
        }).join('\n') + '\n';
    }
    // Modified files with line counts
    const lines = ['| File | Lines Changed |', '|------|--------------|'];
    for (const change of filtered) {
        if (change.isBinary) {
            lines.push(`| \`${change.path}\` | [binary file] |`);
        }
        else {
            const added = change.linesAdded ?? 0;
            const removed = change.linesRemoved ?? 0;
            lines.push(`| \`${change.path}\` | +${added} / -${removed} |`);
        }
    }
    return lines.join('\n') + '\n';
}
function renderDiffs(changes, maxLines) {
    const withDiffs = changes.filter((c) => c.diff && !c.isBinary);
    if (withDiffs.length === 0)
        return '';
    const sections = [];
    for (const change of withDiffs) {
        const diff = truncateDiff(change.diff, maxLines);
        sections.push(`### ${change.path}\n\n\`\`\`diff\n${diff}\n\`\`\``);
    }
    return sections.join('\n\n');
}
function renderCompressedChanges(changes, maxLines) {
    if (changes.length === 0)
        return '';
    const sections = [];
    const byPriority = {};
    for (const change of changes) {
        if (!byPriority[change.priority])
            byPriority[change.priority] = [];
        byPriority[change.priority].push(change);
    }
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    const priorityLabels = {
        critical: 'Critical Changes',
        high: 'High Priority',
        medium: 'Notable Changes',
        low: 'Minor Changes',
    };
    for (const priority of priorityOrder) {
        const group = byPriority[priority];
        if (!group || group.length === 0)
            continue;
        sections.push(`### ${priorityLabels[priority]}\n`);
        for (const change of group) {
            const typeIcon = change.type === 'modified' ? 'M' : change.type === 'added' ? 'A' : 'D';
            let entry = `**[${typeIcon}] \`${change.path}\`** -- ${change.summary}`;
            if (change.functions_changed && change.functions_changed.length > 0) {
                entry += `\n> Functions: ${change.functions_changed.slice(0, 8).map((n) => `\`${n}\``).join(', ')}`;
            }
            sections.push(entry);
            // Show compressed diff if available
            const diffToShow = change.compressed_diff ?? change.diff;
            if (diffToShow && !change.isBinary) {
                const compressed = truncateDiff(diffToShow, maxLines);
                sections.push(`\`\`\`diff\n${compressed}\n\`\`\``);
            }
        }
        sections.push('');
    }
    return sections.join('\n');
}
function renderMemory(memoryContents) {
    const sections = [];
    for (const [file, content] of Object.entries(memoryContents)) {
        sections.push(`### ${file}\n\n${content}`);
    }
    return sections.join('\n\n');
}
function renderDecisions(decisions) {
    if (decisions.length === 0)
        return '';
    const sections = decisions.map((d) => formatDecisionMarkdown(d));
    return sections.join('\n\n---\n\n');
}
function buildFrontmatter(context, duration) {
    const { session, changes, compression_result, decisions } = context;
    const modified = changes.filter((c) => c.type === 'modified').length;
    const added = changes.filter((c) => c.type === 'added').length;
    const deleted = changes.filter((c) => c.type === 'deleted').length;
    const fm = {
        handoff_version: '2.0',
        session_id: session.session_id,
        created_at: session.created_at,
        duration,
        working_dir: session.working_dir,
        ...(session.agent_name && { agent: session.agent_name }),
        changes: { modified, added, deleted },
    };
    if (compression_result) {
        fm.compression = {
            enabled: true,
            token_budget: 0, // filled below
            tokens_used: compression_result.stats.estimated_tokens,
        };
        // Recover budget from stats
        if (compression_result.stats.budget_used_pct > 0) {
            fm.compression.token_budget = Math.round(compression_result.stats.estimated_tokens / (compression_result.stats.budget_used_pct / 100));
        }
    }
    // Identify priority files (critical/high that have diffs)
    if (compression_result) {
        fm.priority_files = compression_result.changes
            .filter((c) => c.priority === 'critical' || c.priority === 'high')
            .map((c) => c.path)
            .slice(0, 10);
    }
    if (decisions && decisions.length > 0) {
        fm.decisions_included = decisions.length;
    }
    // Serialize frontmatter as YAML
    const lines = ['---'];
    lines.push(`handoff_version: "${fm.handoff_version}"`);
    lines.push(`session_id: "${fm.session_id}"`);
    lines.push(`created_at: "${fm.created_at}"`);
    lines.push(`duration: "${fm.duration}"`);
    lines.push(`working_dir: "${fm.working_dir.replace(/\\/g, '/')}"`);
    if (fm.agent)
        lines.push(`agent: "${fm.agent}"`);
    lines.push('changes:');
    lines.push(`  modified: ${fm.changes.modified}`);
    lines.push(`  added: ${fm.changes.added}`);
    lines.push(`  deleted: ${fm.changes.deleted}`);
    if (fm.compression) {
        lines.push('compression:');
        lines.push(`  enabled: true`);
        lines.push(`  token_budget: ${fm.compression.token_budget}`);
        lines.push(`  tokens_used: ${fm.compression.tokens_used}`);
    }
    if (fm.priority_files && fm.priority_files.length > 0) {
        lines.push('priority_files:');
        for (const f of fm.priority_files) {
            lines.push(`  - "${f}"`);
        }
    }
    if (fm.decisions_included !== undefined) {
        lines.push(`decisions_included: ${fm.decisions_included}`);
    }
    lines.push('---');
    return lines.join('\n');
}
export function generateHandoffMarkdown(context) {
    const { session, changes, message, include_memory, memory_contents, config, compression_result, decisions } = context;
    const duration = formatDuration(session.created_at);
    const now = new Date().toISOString();
    const parts = [];
    // YAML frontmatter
    parts.push(buildFrontmatter(context, duration));
    parts.push('');
    parts.push('# Handoff Context\n');
    // Delta export notice
    if (context.delta?.isDelta) {
        const { unchangedCount, targetAgent } = context.delta;
        parts.push(`> **Delta Handoff** for \`${targetAgent}\`: only changes since your last handoff are included.`);
        if (unchangedCount > 0) {
            parts.push(`> ${unchangedCount} unchanged file${unchangedCount !== 1 ? 's' : ''} omitted.`);
        }
        parts.push('');
    }
    // Session info
    parts.push('## Session Info');
    parts.push(`- **Session ID**: ${session.session_id}`);
    parts.push(`- **Started**: ${session.created_at}`);
    parts.push(`- **Duration**: ${duration}`);
    parts.push(`- **Working Directory**: ${session.working_dir}`);
    if (session.agent_name) {
        parts.push(`- **Previous Agent**: ${session.agent_name}`);
    }
    parts.push('');
    // Summary
    if (message) {
        parts.push('## Summary\n');
        parts.push(message);
        parts.push('');
    }
    // Changes
    parts.push('## Changes This Session\n');
    parts.push(renderChangeSummary(changes));
    parts.push('');
    if (changes.length === 0) {
        parts.push('No changes detected since session start.\n');
    }
    else if (compression_result) {
        // Compressed rendering
        const compressed = renderCompressedChanges(compression_result.changes, config.max_diff_lines);
        if (compressed) {
            parts.push(compressed);
        }
        // Compression stats footer
        parts.push(`> *Compression: ${compression_result.stats.total_changes} total changes, ${compression_result.stats.included_changes} shown (~${compression_result.stats.estimated_tokens.toLocaleString()} tokens, ${compression_result.stats.budget_used_pct}% of budget used)*`);
        parts.push('');
    }
    else {
        const modified = changes.filter((c) => c.type === 'modified');
        const added = changes.filter((c) => c.type === 'added');
        const deleted = changes.filter((c) => c.type === 'deleted');
        if (modified.length > 0) {
            parts.push('### Modified Files\n');
            parts.push(renderFileTable(changes, 'modified'));
        }
        if (added.length > 0) {
            parts.push('### New Files\n');
            parts.push(renderFileTable(changes, 'added'));
        }
        if (deleted.length > 0) {
            parts.push('### Deleted Files\n');
            parts.push(renderFileTable(changes, 'deleted'));
        }
    }
    // Full diffs (non-compressed path only)
    if (!compression_result) {
        const diffSection = renderDiffs(changes, config.max_diff_lines);
        if (diffSection) {
            parts.push('## Full Diffs\n');
            parts.push(diffSection);
            parts.push('');
        }
    }
    // Decisions
    if (decisions && decisions.length > 0) {
        parts.push('## Architectural Decisions\n');
        parts.push(renderDecisions(decisions));
        parts.push('');
    }
    // Memory
    if (include_memory && memory_contents && Object.keys(memory_contents).length > 0) {
        parts.push('## Agent Memory\n');
        parts.push(renderMemory(memory_contents));
        parts.push('');
    }
    // Footer
    parts.push('---');
    parts.push(`*Generated by handoff at ${now}*`);
    parts.push('');
    return parts.join('\n');
}
export { formatDuration, truncateDiff };
//# sourceMappingURL=markdown.js.map