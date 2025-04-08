// src/index.ts
import { program } from "commander";
import { registerSyncCommand } from "./commands/sync";
import { registerAddCommand } from "./commands/add";
import { registerFetchCommand } from "./commands/fetch";
import { registerRecordingsCommand } from "./commands/recordings"; // <--- Import new command
import { version } from "../package.json";

async function main() {
  program
    .version(version)
    .name("anki-cli")
    .description("Anki CLI - Interact with Anki via the command line (using AnkiConnect)");

  registerSyncCommand(program);
  registerAddCommand(program);
  registerFetchCommand(program);
  registerRecordingsCommand(program); // <--- Register new command

  program.on("command:*", () => {
    console.error(
      "Invalid command: %s\nSee --help for a list of available commands.",
      program.args.join(" ")
    );
    process.exit(1);
  });

  await program.parseAsync(process.argv);

  // Keep the existing logic for handling bare calls or invalid commands
  const BARE_CALL = process.argv.slice(2).length === 0;
  const firstArg = process.argv[2];
  const KNOWN_COMMAND_CALLED = firstArg && program.commands.some(cmd => cmd.name() === firstArg || cmd.aliases().includes(firstArg));
  const HELP_OR_VERSION_FLAG = process.argv.slice(2).some(arg => ['--help', '-h', '--version', '-V'].includes(arg));

  if (BARE_CALL && !HELP_OR_VERSION_FLAG) {
      program.outputHelp();
  }
  else if (process.argv.slice(2).length > 0 && !KNOWN_COMMAND_CALLED && !HELP_OR_VERSION_FLAG && !firstArg?.startsWith('-')) {
      console.error(
        "Invalid command: %s\nSee --help for a list of available commands.",
        firstArg
      );
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ An unexpected error occurred:");
  if (error instanceof Error) {
    // Check if it's a prompt cancellation error (empty string)
    if ((error as any).message === '') {
        console.log("Operation cancelled.");
        process.exitCode = 0; // Treat cancellation as non-error exit
    } else {
        console.error(error.message);
        process.exitCode = 1;
    }
  } else {
    console.error(error);
    process.exitCode = 1;
  }
  // process.exit(1); // Let the process exit naturally based on exitCode
});