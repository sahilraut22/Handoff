#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerExportCommand } from './commands/export.js';
import { registerListCommand } from './commands/list.js';
import { registerNameCommand } from './commands/name.js';
import { registerStatusCommand } from './commands/status.js';

const program = new Command();

program
  .name('handoff')
  .description('Seamless context transfer between AI coding agents')
  .version('0.1.0');

registerInitCommand(program);
registerExportCommand(program);
registerListCommand(program);
registerNameCommand(program);
registerStatusCommand(program);

program.parse();
