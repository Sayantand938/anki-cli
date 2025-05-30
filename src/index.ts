import { program } from 'commander';
import { version } from '../package.json';
import { registerSyncCommand } from "./commands/sync";
import { registerAddCommand } from "./commands/add";
import { registerSLgenCommand } from "./commands/sl_gen";
import { registerVideolinkCommand } from "./commands/video_link";
import { registerDeckstatsCommand } from "./commands/deckstats";
import { registerNoteIdSelectorCommand } from "./commands/noteid_selector";
import {registerExportNotesCommand} from "./commands/export_notes";
import {registerProcessWithGeminiCommand} from "./commands/process_with_gemini";
import { registerTagUpdateCommand } from "./commands/tag_update";
import { registerAutomateCommand } from "./commands/automate";
import { registerExtraUpdateCommand } from "./commands/extra_update";
import { registerTagCheckCommand } from "./commands/tag_check";
import { registerInstructionsUpdateCommand } from "./commands/instructions_update";
import { registerCleanTagsCommand } from "./commands/clean_tags";
import { registerVocabMeaningUpdateCommand } from "./commands/vocab_meaning_update";
import { registerCleanVideoCommand } from "./commands/clean_video";


async function main() {
    program
        .version(version)
        .name("anki-cli")
        .description('Time CLI - A simple command-line time tracker');

    // Register all commands
    registerSyncCommand(program);
    registerAddCommand(program);
    registerSLgenCommand(program);
    registerVideolinkCommand(program);
    registerDeckstatsCommand(program);
    registerNoteIdSelectorCommand(program);
    registerExportNotesCommand(program);
    registerProcessWithGeminiCommand(program);
    registerTagUpdateCommand(program);
    registerExtraUpdateCommand(program);
    registerAutomateCommand(program);
    registerTagCheckCommand(program);
    registerInstructionsUpdateCommand(program);
    registerCleanTagsCommand(program);
    registerVocabMeaningUpdateCommand(program);
    registerCleanVideoCommand(program);

    // Add default behavior or help if no command is specified
    program.on('command:*', () => {
        console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
        process.exit(1);
    });

    // Parse arguments and execute corresponding command action
    await program.parseAsync(process.argv);

    // If no command was matched by Commander (and arguments were provided), show error.
    // If no arguments were provided at all, show help.
    if (process.argv.slice(2).length > 0 && !program.args.includes(process.argv[2])) {
        if (!program.commands.map(cmd => cmd.name()).includes(process.argv[2]) && !['--help', '-h', '--version', '-V'].includes(process.argv[2])) {
            console.error('Invalid command: %s\nSee --help for a list of available commands.', process.argv[2]);
            process.exit(1);
        }
    } else if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

main().catch(error => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
});
