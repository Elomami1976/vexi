#!/usr/bin/env node
/**
 * Vexi entry point.
 */

import { buildCli } from './cli.js';

// Node 18+ is required (built-in fetch / web streams).
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`Vexi requires Node.js 18 or newer (you have ${process.versions.node}).`);
  process.exit(1);
}

// Exit cleanly on Ctrl+C anywhere outside a prompt.
process.on('SIGINT', () => {
  process.exit(0);
});

buildCli()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    // @inquirer throws ExitPromptError when the user presses Ctrl+C in a prompt
    if (error instanceof Error && error.name === 'ExitPromptError') {
      process.exit(0);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
