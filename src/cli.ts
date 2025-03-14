import { Command } from 'commander';
import { exportAction } from './commands/export.js';
import { explainAction } from './commands/explain.js';
import { tagAction } from './commands/tag.js'; // Import the tag command
import { syncAction } from './commands/sync.js'; // Import the sync command

// Initialize CLI program
const program = new Command();

program.name('anki-cli').description('A sample CLI tool').version('1.0.0');

// Export Command
program
  .command('export')
  .description(
    "Exports note details from the 'Custom Study Session' deck to a JSON file"
  )
  .action(exportAction);

// Explain Command
program
  .command('explain')
  .description(
    "Explains notes from the 'Custom Study Session' deck in a user-friendly format"
  )
  .action(explainAction);

// Tag Command
program
  .command('tag') 
  .description("Tags notes in the 'Custom Study Session' deck with a topic tag")
  .action(tagAction);

// Sync Command (Newly Added)
program
  .command('sync')
  .description('Starts the Anki Sync Server for syncing media files')
  .action(syncAction);

// Show help if no arguments are passed
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse(process.argv);