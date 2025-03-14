// src/cli.ts
import { Command } from 'commander';
import { exportAction } from './commands/export.js';
import { explainAction } from './commands/explain.js';
import { tagAction } from './commands/tag.js'; // Import the new tag command

// Initialize CLI program
const program = new Command();

program.name('anki-cli').description('A sample CLI tool').version('1.0.0');

program
  .command('export')
  .description(
    "Exports note details from the 'Custom Study Session' deck to a JSON file"
  )
  .action(exportAction);

program
  .command('explain')
  .description(
    "Explains notes from the 'Custom Study Session' deck in a user-friendly format"
  )
  .action(explainAction);

program
  .command('tag') // Add the tag command
  .description("Tags notes in the 'Custom Study Session' deck with a topic tag")
  .action(tagAction);

// Show help if no arguments are passed
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse(process.argv);
