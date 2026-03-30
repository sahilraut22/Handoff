import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { AGENT_REGISTRY } from '../lib/agents.js';
import { loadConfig } from '../lib/config.js';
import { extractDecisions, formatExtractedForReview } from '../lib/decision-extractor.js';
import { saveExtractedDecisions } from '../lib/decisions.js';
import { createLogMonitor } from '../lib/conversation-monitor.js';
import { AgentError, ErrorCode } from '../lib/errors.js';
import type { MonitorConfig } from '../types/index.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <agent>')
    .description('Run an AI agent with automatic context and decision monitoring')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .option('--dry-run', 'Show what would be captured without saving')
    .option('--min-confidence <n>', 'Minimum confidence threshold for saving decisions (0-1)', '0.7')
    .action(async (agentName: string, options: {
      dir?: string;
      dryRun?: boolean;
      minConfidence: string;
    }) => {
      const workingDir = resolve(options.dir ?? process.cwd());
      const minConfidence = Math.max(0, Math.min(1, parseFloat(options.minConfidence) || 0.7));

      // Look up agent config
      const agentConfig = AGENT_REGISTRY[agentName.toLowerCase()];
      if (!agentConfig) {
        throw new AgentError(ErrorCode.AGENT_NOT_FOUND,
          `Unknown agent: ${agentName}.`,
          { recoveryHint: `Known agents: ${Object.keys(AGENT_REGISTRY).join(', ')}` });
      }

      await loadConfig(workingDir);

      const capturedLines: string[] = [];

      // Start log monitor for this agent
      const logPaths = [join(process.env['HOME'] ?? process.env['USERPROFILE'] ?? '', `.${agentName}/logs`)];
      const monitorConfig: MonitorConfig = {
        agent: agentName,
        log_paths: logPaths,
        poll_interval_ms: 3000,
        last_read_offset: 0,
      };
      const logMonitor = createLogMonitor(monitorConfig);
      logMonitor.start();

      console.log(`Starting ${agentConfig.name} with decision monitoring...`);
      console.log(`Command: ${agentConfig.command}`);
      console.log('(Ctrl+C to exit)\n');

      // Spawn the agent
      const parts = agentConfig.command.split(' ');
      const cmd = parts[0]!;
      const args = parts.slice(1);

      const child = spawn(cmd, args, {
        cwd: workingDir,
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });

      // Intercept stdout for decision extraction
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        process.stdout.write(text);
        capturedLines.push(text);
      });

      // Pass stderr through unchanged
      child.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
      });

      // Wait for agent to exit
      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0));
        child.on('error', () => resolve(1));
      });

      logMonitor.stop();

      // Extract decisions from captured output
      const capturedText = capturedLines.join('');
      const outputExtracted = extractDecisions(capturedText, 'conversation');
      const logExtracted = logMonitor.getExtracted();
      const allExtracted = [...outputExtracted, ...logExtracted];

      if (allExtracted.length === 0) {
        console.log('\nNo decisions detected in this session.');
      } else if (options.dryRun) {
        console.log('\n--- Dry run: decisions that would be saved ---');
        console.log(formatExtractedForReview(allExtracted.filter((d) => d.confidence >= minConfidence)));
      } else {
        const saved = await saveExtractedDecisions(workingDir, allExtracted, minConfidence);
        if (saved.length > 0) {
          console.log(`\nExtracted ${saved.length} decision(s) from session. Run \`handoff decisions\` to review.`);
        } else {
          const total = allExtracted.length;
          if (total > 0) {
            console.log(`\nDetected ${total} potential decision(s) but none met the confidence threshold (${minConfidence}).`);
          }
        }
      }

      process.exit(exitCode);
    });
}
