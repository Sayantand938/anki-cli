import { Command } from 'commander';
import { execa } from 'execa';

export function registerAutomateCommand(program: Command) {
    program
        .command('automate')
        .description('Runs export_notes → process_with_gemini → [tag_update or extra_update] in sequence')
        // Changed the default value from 'tagging' to 'tag'
        .option('--mode <type>', 'Specify guidelines mode (e.g. tag, gk, eng)', 'tag') // Default is now 'tag'
        .action(async (options) => {
            const guidelineMap: Record<string, string> = {
                // Keep 'tagging' as a valid key if the instruction file is still named tagging_instructions.md
                // Or, if the instruction file name should also change, update this map accordingly.
                // Assuming the instruction file name remains 'tagging_instructions.md' for 'tag' mode.
                tag: 'tagging_instructions.md', // Added 'tag' mode mapping
                tagging: 'tagging_instructions.md', // Kept 'tagging' for backward compatibility or clarity if needed
                gk: 'gk_extra_instructions.md',
                eng: 'eng_explanation_instructions.md'
            };

            const guidelineFile = guidelineMap[options.mode];

            if (!guidelineFile) {
                console.error(`❌ Invalid mode: ${options.mode}`);
                console.error(`Available modes: ${Object.keys(guidelineMap).join(', ')}`);
                process.exit(1);
            }

            // Determine which final update script to run
            // Check if the selected mode is 'tag' or 'tagging' to use tag_update
            const isTaggingMode = options.mode === 'tag' || options.mode === 'tagging';
            const finalStepCmd = isTaggingMode ? 'tag_update' : 'extra_update';

            const steps = [
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    args: ['export_notes'],
                    label: 'export_notes'
                },
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    args: ['process_with_gemini', '--guidelines', guidelineFile],
                    label: `process_with_gemini (${options.mode})`
                },
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    args: [finalStepCmd],
                    label: finalStepCmd
                }
            ];

            for (const step of steps) {
                console.log(`\n🚀 Running: ${step.label}`);

                try {
                    const subprocess = execa(step.cmd, step.args, {
                        stdio: 'inherit' // Show logs in real time
                    });

                    await subprocess;
                } catch (error: any) { // Catch error with type any for flexibility
                    console.error(`❌ Failed: ${step.label}`);
                    console.error(`Error details: ${error.message || error}`); // Log error message
                    console.error(`Stopping workflow due to error.`);
                    process.exit(1);
                }
            }

            console.log('\n✅ Full automation workflow completed successfully!');
        });
}
