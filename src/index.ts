// src/index.ts
import { program, Command } from "commander";
import { registerSyncCommand } from "./commands/sync";
import { registerAddCommand } from "./commands/add";
import { registerTokengenCommand, TokengenCommandOptions } from "./commands/tokengen";
import { registerVideolinkCommand, VideolinkCommandOptions } from "./commands/videolink";
import { registerExportnotesCommand, ExportNotesCommandOptions } from "./commands/exportnotes";
// Import the registration functions for the new commands
import { registerTagupdateCommand, TagUpdateCommandOptions } from "./commands/tagupdate"; // CHANGED import
import { registerExtraupdateCommand, ExtraUpdateCommandOptions } from "./commands/extraupdate";
import { version } from "../package.json";

async function main() {
  program
    .version(version)
    .name("anki-cli")
    .description("Anki CLI - Interact with Anki via the command line (using AnkiConnect)");

  // Register commands
  registerSyncCommand(program);
  registerAddCommand(program);
  registerTokengenCommand(program);
  registerVideolinkCommand(program);
  registerExportnotesCommand(program);
  registerTagupdateCommand(program);  // CHANGED registration call
  registerExtraupdateCommand(program);

  program.on("command:*", (operands) => {
    console.error(
      "Invalid command: %s\nSee --help for a list of available commands.",
      operands.join(" ")
    );
    process.exitCode = 1;
  });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    throw err; // Re-throw to be caught by main().catch()
  }

  const BARE_CALL = process.argv.slice(2).length === 0;
  const HELP_OR_VERSION_FLAG_CALLED = process.argv.slice(2).some(arg => ['--help', '-h', '--version', '-V'].includes(arg));

  if (BARE_CALL && !HELP_OR_VERSION_FLAG_CALLED) {
      program.outputHelp();
  }
}

main().catch((error) => {
  console.error("\n❌ An unexpected error occurred:");
  if (error instanceof Error) {
    if ((error as any).message === '' && (error as any).isPromptCancelled === true) {
        console.log("Operation cancelled by user.");
        process.exitCode = 0;
    } else if (
        error.message.startsWith("AnkiConnect Error:") ||
        error.message.startsWith("AnkiConnect request failed:") ||
        error.message.startsWith("Could not connect to AnkiConnect") ||
        error.message.startsWith("Failed to send AnkiConnect request:") ||
        error.message.includes("AnkiConnect API Error")
    ) {
        console.error(error.message);
        process.exitCode = 1;
    } else {
        console.error("Details:", error.message);
        process.exitCode = 1;
    }
  } else {
    console.error("An unknown error object was thrown:", error);
    process.exitCode = 1;
  }
});