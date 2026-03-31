import { Command } from 'commander';
import { resolve } from 'node:path';
import {
  loadAllDecisions,
  loadDecision,
  searchDecisions,
  updateDecisionStatus,
  reviewPendingDecisions,
  formatDecisionMarkdown,
  formatDecisionsTable,
} from '../lib/decisions.js';
import { HandoffValidationError, SessionError, ErrorCode } from '../lib/errors.js';
import type { DecisionStatus } from '../types/index.js';

export function registerDecisionsCommand(program: Command): void {
  const decisionsCmd = program
    .command('decisions')
    .description('List, search, and view architectural decisions')
    .option('--search <query>', 'Search decisions by keyword')
    .option('--tag <tag>', 'Filter by tag')
    .option('--status <status>', 'Filter by status (accepted|proposed|superseded|deprecated)')
    .option('--format <fmt>', 'Output format: table (default) or json')
    .action(async (options: {
      search?: string;
      tag?: string;
      status?: string;
      format?: string;
    }) => {
      const workingDir = resolve(process.cwd());

      let decisions = options.search
        ? await searchDecisions(workingDir, options.search)
        : await loadAllDecisions(workingDir);

      if (options.tag) {
        const tag = options.tag.toLowerCase();
        decisions = decisions.filter((d) => d.tags?.some((t) => t.toLowerCase() === tag));
      }

      if (options.status) {
        const validStatuses: DecisionStatus[] = ['accepted', 'proposed', 'superseded', 'deprecated'];
        if (!validStatuses.includes(options.status as DecisionStatus)) {
          throw new HandoffValidationError(ErrorCode.INVALID_STATUS,
            `Invalid status filter: ${options.status}.`);
        }
        decisions = decisions.filter((d) => d.status === options.status);
      }

      if (decisions.length === 0) {
        if (options.search || options.tag || options.status) {
          console.log('No decisions match the given filters.');
        } else {
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
    .action(async (id: string) => {
      const workingDir = resolve(process.cwd());
      try {
        const decision = await loadDecision(workingDir, id);
        console.log(formatDecisionMarkdown(decision));
      } catch {
        throw new SessionError(ErrorCode.SESSION_NOT_FOUND,
          `Decision '${id}' not found.`,
          { recoveryHint: "Use 'handoff decisions' to list all decisions." });
      }
    });

  // Subcommand: decisions review
  decisionsCmd
    .command('review')
    .description('Review auto-extracted decisions pending approval')
    .option('--accept-all', 'Accept all pending decisions without prompting')
    .option('--reject-all', 'Reject (delete) all pending decisions without prompting')
    .action(async (options: { acceptAll?: boolean; rejectAll?: boolean }) => {
      const workingDir = resolve(process.cwd());
      const pending = await reviewPendingDecisions(workingDir);

      if (pending.length === 0) {
        console.log('No pending decisions to review.');
        console.log('Run `handoff export` or `handoff run <agent>` to extract decisions automatically.');
        return;
      }

      if (options.acceptAll) {
        for (const d of pending) {
          await updateDecisionStatus(workingDir, d.id, 'accepted');
        }
        console.log(`Accepted ${pending.length} decision(s).`);
        return;
      }

      if (options.rejectAll) {
        const { unlink } = await import('node:fs/promises');
        const { join } = await import('node:path');
        for (const d of pending) {
          await unlink(join(workingDir, '.handoff', 'decisions', `${d.id}.yaml`)).catch(() => undefined);
        }
        console.log(`Rejected ${pending.length} decision(s).`);
        return;
      }

      // Interactive review: print each and prompt
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const question = (prompt: string): Promise<string> =>
        new Promise((res) => rl.question(prompt, res));

      console.log(`\n${pending.length} pending decision(s) to review:\n`);

      for (let i = 0; i < pending.length; i++) {
        const d = pending[i]!;
        console.log(`[${i + 1}/${pending.length}] ${formatDecisionMarkdown(d)}`);
        console.log(`Confidence: ${Math.round((d.confidence ?? 0) * 100)}%  |  Source: ${d.source ?? 'unknown'}`);
        console.log('');

        const answer = await question('Accept? [y]es / [n]o / [s]kip all remaining: ');
        const choice = answer.trim().toLowerCase();

        if (choice === 'y' || choice === 'yes') {
          await updateDecisionStatus(workingDir, d.id, 'accepted');
          console.log('Accepted.\n');
        } else if (choice === 's') {
          console.log('Skipping remaining decisions.');
          break;
        } else {
          const { unlink } = await import('node:fs/promises');
          const { join } = await import('node:path');
          await unlink(join(workingDir, '.handoff', 'decisions', `${d.id}.yaml`)).catch(() => undefined);
          console.log('Rejected.\n');
        }
      }

      rl.close();
      console.log('Review complete. Run `handoff decisions` to see your journal.');
    });
}
