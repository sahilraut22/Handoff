import { resolve } from 'node:path';
import { loadAllDecisions, loadDecision, searchDecisions, formatDecisionMarkdown, formatDecisionsTable, } from '../lib/decisions.js';
import { HandoffValidationError, SessionError, ErrorCode } from '../lib/errors.js';
export function registerDecisionsCommand(program) {
    const decisionsCmd = program
        .command('decisions')
        .description('List, search, and view architectural decisions')
        .option('--search <query>', 'Search decisions by keyword')
        .option('--tag <tag>', 'Filter by tag')
        .option('--status <status>', 'Filter by status (accepted|proposed|superseded|deprecated)')
        .option('--format <fmt>', 'Output format: table (default) or json')
        .action(async (options) => {
        const workingDir = resolve(process.cwd());
        let decisions = options.search
            ? await searchDecisions(workingDir, options.search)
            : await loadAllDecisions(workingDir);
        if (options.tag) {
            const tag = options.tag.toLowerCase();
            decisions = decisions.filter((d) => d.tags?.some((t) => t.toLowerCase() === tag));
        }
        if (options.status) {
            const validStatuses = ['accepted', 'proposed', 'superseded', 'deprecated'];
            if (!validStatuses.includes(options.status)) {
                throw new HandoffValidationError(ErrorCode.INVALID_STATUS, `Invalid status filter: ${options.status}.`);
            }
            decisions = decisions.filter((d) => d.status === options.status);
        }
        if (decisions.length === 0) {
            if (options.search || options.tag || options.status) {
                console.log('No decisions match the given filters.');
            }
            else {
                console.log('No decisions recorded yet.');
                console.log("Use 'handoff decide' to record your first decision.");
            }
            return;
        }
        if (options.format === 'json') {
            console.log(JSON.stringify(decisions, null, 2));
            return;
        }
        console.log(formatDecisionsTable(decisions));
        console.log(`\n${decisions.length} decision${decisions.length !== 1 ? 's' : ''} total`);
    });
    // Subcommand: decisions show <id>
    decisionsCmd
        .command('show <id>')
        .description('Show a single decision in detail')
        .action(async (id) => {
        const workingDir = resolve(process.cwd());
        try {
            const decision = await loadDecision(workingDir, id);
            console.log(formatDecisionMarkdown(decision));
        }
        catch {
            throw new SessionError(ErrorCode.SESSION_NOT_FOUND, `Decision '${id}' not found.`, { recoveryHint: "Use 'handoff decisions' to list all decisions." });
        }
    });
}
//# sourceMappingURL=decisions.js.map