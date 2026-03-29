#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerExportCommand } from './commands/export.js';
import { registerAskCommand } from './commands/ask.js';
import { registerListCommand } from './commands/list.js';
import { registerNameCommand } from './commands/name.js';
import { registerStatusCommand } from './commands/status.js';
import { registerStartCommand } from './commands/start.js';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerFocusCommand } from './commands/focus.js';
import { registerLayoutCommand } from './commands/layout.js';
import { registerAttachCommand } from './commands/attach.js';
import { registerKillCommand } from './commands/kill.js';
import { registerBridgeCommand } from './commands/bridge.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerDecideCommand } from './commands/decide.js';
import { registerDecisionsCommand } from './commands/decisions.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerSchemaCommand } from './commands/schema.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string };

const program = new Command();

program
  .name('handoff')
  .description('Seamless context transfer between AI coding agents')
  .version(pkg.version);

// Context transfer commands
registerInitCommand(program);
registerExportCommand(program);
registerAskCommand(program);

// Decision journal
registerDecideCommand(program);
registerDecisionsCommand(program);

// Protocol / validation
registerValidateCommand(program);
registerSchemaCommand(program);

// Workspace commands
registerStartCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerFocusCommand(program);
registerLayoutCommand(program);
registerAttachCommand(program);
registerKillCommand(program);

// Pane management
registerListCommand(program);
registerNameCommand(program);
registerStatusCommand(program);

// Agent-to-agent IPC bridge
registerBridgeCommand(program);

// Setup / diagnostics
registerSetupCommand(program);

program.parse();
