import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { walkFiles, hashAllFiles } from '../lib/snapshot.js';
import { isTmuxAvailable, listPanes } from '../lib/tmux.js';
import { detectAgents } from '../lib/agents.js';
import { formatDuration } from '../lib/markdown.js';
import { readQueryLog } from '../lib/logger.js';
import { loadWorkspaceState } from '../lib/workspace.js';
import { boxTop, boxBottom, boxDivider, boxRow } from '../lib/ui.js';
import { SessionError, ErrorCode } from '../lib/errors.js';
const WIDTH = 65;
export function registerStatusCommand(program) {
    program
        .command('status')
        .description('Show current session status.')
        .option('-d, --dir <path>', 'Target directory (default: current directory)')
        .action(async (options) => {
        const workingDir = resolve(options.dir ?? process.cwd());
        const handoffDir = join(workingDir, '.handoff');
        // Read session
        let session;
        try {
            const content = await readFile(join(handoffDir, 'session.json'), 'utf-8');
            session = JSON.parse(content);
        }
        catch {
            throw new SessionError(ErrorCode.SESSION_NOT_FOUND, 'No active session.');
        }
        const config = await loadConfig(workingDir);
        const workspaceState = await loadWorkspaceState(workingDir);
        // Count changes
        const currentFiles = await walkFiles(workingDir, config.exclude_patterns);
        const currentHashes = await hashAllFiles(workingDir, currentFiles);
        const oldHashes = session.file_hashes;
        let modified = 0, added = 0, deleted = 0;
        for (const f of Object.keys(oldHashes)) {
            if (!(f in currentHashes))
                deleted++;
        }
        for (const f of Object.keys(currentHashes)) {
            if (!(f in oldHashes))
                added++;
            else if (currentHashes[f] !== oldHashes[f])
                modified++;
        }
        const duration = formatDuration(session.created_at);
        // Print session block
        console.log(boxTop(WIDTH));
        console.log(boxRow('HANDOFF STATUS', WIDTH));
        console.log(boxDivider(WIDTH));
        console.log(boxRow(`Session:    ${session.session_id.slice(0, 36)}`, WIDTH));
        console.log(boxRow(`Project:    ${session.working_dir}`, WIDTH));
        console.log(boxRow(`Started:    ${duration} ago`, WIDTH));
        if (workspaceState) {
            console.log(boxRow(`Workspace:  ${workspaceState.session_name} (${workspaceState.panes.length} panes)`, WIDTH));
        }
        if (session.last_export) {
            console.log(boxRow(`Last Export: ${formatDuration(session.last_export)} ago`, WIDTH));
        }
        console.log(boxDivider(WIDTH));
        console.log(boxRow('CHANGES SINCE INIT', WIDTH));
        console.log(boxRow(`  Modified: ${modified} files`, WIDTH));
        console.log(boxRow(`  Added:    ${added} files`, WIDTH));
        console.log(boxRow(`  Deleted:  ${deleted} files`, WIDTH));
        // Show agents if tmux available
        if (isTmuxAvailable()) {
            const panes = listPanes();
            const agents = detectAgents(panes);
            if (agents.length > 0) {
                console.log(boxDivider(WIDTH));
                console.log(boxRow('AGENTS', WIDTH));
                for (const agent of agents) {
                    const status = agent.pane.active ? '\u25cf' : '\u25cb';
                    const labelStr = agent.label ? ` (${agent.label})` : '';
                    console.log(boxRow(`  ${status} ${agent.name}${labelStr}  pane ${agent.pane.pane_id}`, WIDTH));
                }
            }
        }
        // Recent queries
        const queries = await readQueryLog(workingDir);
        if (queries.length > 0) {
            const recent = queries.slice(-3).reverse();
            console.log(boxDivider(WIDTH));
            console.log(boxRow('RECENT QUERIES', WIDTH));
            for (const q of recent) {
                const ago = formatDuration(q.timestamp);
                const preview = q.question.length > 35 ? q.question.slice(0, 35) + '...' : q.question;
                console.log(boxRow(`  -> ${q.agent}: "${preview}" (${ago} ago)`, WIDTH));
            }
        }
        console.log(boxBottom(WIDTH));
    });
}
//# sourceMappingURL=status.js.map