import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { AGENT_REGISTRY } from '../lib/agents.js';
import { loadConfig } from '../lib/config.js';
import { formatExtractedForReview } from '../lib/decision-extractor.js';
import { saveExtractedDecisions } from '../lib/decisions.js';
import { discoverAgentLogs, createLogMonitor } from '../lib/conversation-monitor.js';
import { AgentError, ErrorCode } from '../lib/errors.js';
export function registerRunCommand(program) {
    program
        .command('run <agent>')
        .description('Run an AI agent with automatic decision monitoring after session ends')
        .option('-d, --dir <path>', 'Working directory (default: current directory)')
        .option('--dry-run', 'Show what would be captured without saving')
        .option('--min-confidence <n>', 'Minimum confidence threshold for saving decisions (0-1)', '0.7')
        .action(async (agentName, options) => {
        const workingDir = resolve(options.dir ?? process.cwd());
        const minConfidence = Math.max(0, Math.min(1, parseFloat(options.minConfidence) || 0.7));
        // Look up agent config
        const agentConfig = AGENT_REGISTRY[agentName.toLowerCase()];
        if (!agentConfig) {
            throw new AgentError(ErrorCode.AGENT_NOT_FOUND, `Unknown agent: ${agentName}.`, { recoveryHint: `Known agents: ${Object.keys(AGENT_REGISTRY).join(', ')}` });
        }
        await loadConfig(workingDir);
        // Discover log paths for this agent before launching
        const logPaths = discoverAgentLogs(agentName);
        const monitorConfig = {
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
        // Spawn the agent with full TTY passthrough so interactive CLIs work correctly
        const parts = agentConfig.command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        const child = spawn(cmd, args, {
            cwd: workingDir,
            stdio: 'inherit',
            shell: true,
        });
        // Wait for agent to exit
        const exitCode = await new Promise((resolve, reject) => {
            child.on('exit', (code) => resolve(code ?? 0));
            child.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    reject(new AgentError(ErrorCode.AGENT_NOT_FOUND, `Command not found: "${agentConfig.command}". Is ${agentConfig.name} installed?`, { recoveryHint: `Install it first, then retry: handoff run ${agentName}` }));
                }
                else {
                    reject(err);
                }
            });
        });
        await logMonitor.stop();
        // Extract decisions from log files captured during the session
        const allExtracted = logMonitor.getExtracted();
        if (allExtracted.length === 0) {
            console.log('\nNo decisions detected in this session.');
            if (logPaths.length === 0) {
                console.log(`(No known log paths for ${agentName} — log monitoring not available)`);
            }
        }
        else if (options.dryRun) {
            console.log('\n--- Dry run: decisions that would be saved ---');
            console.log(formatExtractedForReview(allExtracted.filter((d) => d.confidence >= minConfidence)));
        }
        else {
            const saved = await saveExtractedDecisions(workingDir, allExtracted, minConfidence);
            if (saved.length > 0) {
                console.log(`\nExtracted ${saved.length} decision(s) from session. Run \`handoff decisions\` to review.`);
            }
            else {
                const total = allExtracted.length;
                if (total > 0) {
                    console.log(`\nDetected ${total} potential decision(s) but none met the confidence threshold (${minConfidence}).`);
                }
            }
        }
        process.exit(exitCode);
    });
}
//# sourceMappingURL=run.js.map