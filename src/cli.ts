#!/usr/bin/env node
import { generateCommand } from './commands/generate.js';
import { initCommand } from './commands/init.js';

function printHelp() {
    console.log(`db-man

Usage:
  db-man init
  db-man generate [--dry-run]

Commands:
  init       Create a .dbman configuration file in the current app.
  generate   Generate application code from the configured database schema.

Options:
  -h, --help  Show help.
`);
}

async function main() {
    const [command, ...args] = process.argv.slice(2);

    if (!command || command === '-h' || command === '--help') {
        printHelp();
        return;
    }

    if (command === 'init') {
        await initCommand(args);
        return;
    }

    if (command === 'generate') {
        await generateCommand(args);
        return;
    }

    throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
