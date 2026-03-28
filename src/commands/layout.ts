import { Command } from 'commander';
import { resolve } from 'node:path';
import { isTmuxAvailable, selectLayout } from '../lib/tmux.js';
import { loadWorkspaceState } from '../lib/workspace.js';

const LAYOUT_MAP: Record<string, string> = {
  grid:       'tiled',
  horizontal: 'even-horizontal',
  vertical:   'even-vertical',
  tiled:      'tiled',
};

export function registerLayoutCommand(program: Command): void {
  program
    .command('layout <style>')
    .description('Change the workspace pane layout. Styles: grid, horizontal, vertical, tiled')
    .option('-d, --dir <path>', 'Working directory (default: current directory)')
    .action(async (style: string, options: { dir?: string }) => {
      if (!isTmuxAvailable()) {
        console.error('tmux is not available.');
        process.exit(1);
      }

      const tmuxLayout = LAYOUT_MAP[style];
      if (!tmuxLayout) {
        console.error(`Unknown layout style '${style}'. Choose from: ${Object.keys(LAYOUT_MAP).join(', ')}`);
        process.exit(1);
      }

      const workingDir = resolve(options.dir ?? process.cwd());
      const state = await loadWorkspaceState(workingDir);
      const sessionName = state?.session_name ?? 'handoff';

      try {
        selectLayout(tmuxLayout, sessionName);
        console.log(`Layout changed to '${style}'.`);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
