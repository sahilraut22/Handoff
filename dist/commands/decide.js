import { resolve } from 'node:path';
import { generateDecisionId, saveDecision, updateDecisionStatus } from '../lib/decisions.js';
import { HandoffValidationError, ErrorCode } from '../lib/errors.js';
export function registerDecideCommand(program) {
    program
        .command('decide <title>')
        .description('Record an architectural decision in the decision journal')
        .requiredOption('-c, --context <text>', 'Why this decision was needed')
        .option('-d, --decision <text>', 'What was decided (defaults to title)')
        .option('-a, --alternatives <items...>', 'Alternatives that were considered')
        .option('--consequences <text>', 'Known tradeoffs or consequences')
        .option('-t, --tags <items...>', 'Categorization tags (e.g., auth performance api)')
        .option('-s, --status <status>', 'Decision status (accepted|proposed|superseded|deprecated)', 'accepted')
        .option('--supersedes <id>', 'ID of the decision this replaces')
        .option('--agent <name>', 'Agent that made this decision')
        .action(async (title, options) => {
        const workingDir = resolve(process.cwd());
        const validStatuses = ['accepted', 'proposed', 'superseded', 'deprecated'];
        if (!validStatuses.includes(options.status)) {
            throw new HandoffValidationError(ErrorCode.INVALID_STATUS, `Invalid status: ${options.status}.`);
        }
        const id = generateDecisionId();
        const decision = {
            id,
            title,
            status: options.status,
            date: new Date().toISOString(),
            context: options.context,
            decision: options.decision ?? title,
            ...(options.alternatives && options.alternatives.length > 0 && { alternatives: options.alternatives }),
            ...(options.consequences && { consequences: options.consequences }),
            ...(options.tags && options.tags.length > 0 && { tags: options.tags }),
            ...(options.supersedes && { supersedes: options.supersedes }),
            ...(options.agent && { agent: options.agent }),
        };
        await saveDecision(workingDir, decision);
        // If superseding another decision, mark it as superseded
        if (options.supersedes) {
            try {
                await updateDecisionStatus(workingDir, options.supersedes, 'superseded');
            }
            catch {
                console.warn(`Warning: Could not mark decision '${options.supersedes}' as superseded (not found)`);
            }
        }
        console.log(`Decision recorded: ${id}`);
        console.log(`  Title:  ${title}`);
        console.log(`  Status: ${decision.status}`);
        if (decision.tags && decision.tags.length > 0) {
            console.log(`  Tags:   ${decision.tags.join(', ')}`);
        }
        if (options.supersedes) {
            console.log(`  Supersedes: ${options.supersedes}`);
        }
        console.log('');
        console.log(`Use 'handoff decisions show ${id}' to view it.`);
    });
}
//# sourceMappingURL=decide.js.map