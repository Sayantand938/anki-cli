import { Command } from 'commander';
import { execa } from 'execa';

export function registerAutomateCommand(program: Command) {
    program
        .command('automate')
        .description('Runs export_notes → process_with_gemini → [tag_update or extra_update or tag_check.ts] in sequence') // Updated description
        .option('--mode <type>', 'Specify guidelines mode (e.g. tag, gk, eng, tag_check)', 'tag')
        .action(async (options) => {
            const guidelineMap: Record<string, string> = {
                tag: 'Question Tagging Guidelines.md',
                tagging: 'Question Tagging Guidelines.md',
                gk: 'GK Extra field Guidelines.md',
                eng: 'ENG Extra field Guidelines.md',
                'tag_check': 'Tag Checking Guidelines.md'
            };

            const guidelineFile = guidelineMap[options.mode];

            if (!guidelineFile) {
                console.error(`❌ Invalid mode: ${options.mode}`);
                console.error(`Available modes: ${Object.keys(guidelineMap).join(', ')}`);
                process.exit(1);
            }

            // Determine which final update script to run based on the mode
            let finalStepCmd: string;
            if (options.mode === 'tag_check') {
                finalStepCmd = 'tag_check'; // Use tag_check specifically for tag_check mode
            } else if (options.mode === 'tag' || options.mode === 'tagging') {
                finalStepCmd = 'tag_update'; // Use tag_update for tag and tagging modes
            } else {
                finalStepCmd = 'extra_update'; // Use extra_update for other modes (gk, eng)
            }


            // Determine the mode to pass to the export_notes command
            // For 'tag_check' mode, export_notes should use the 'tag' mode
            const exportNotesMode = options.mode === 'tag_check' ? 'tag' : options.mode;

            const steps = [
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    // Pass the determined exportNotesMode to the export_notes command
                    args: ['export_notes', '-m', exportNotesMode],
                    label: `export_notes (mode: ${exportNotesMode})`
                },
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    // Use the guidelineFile determined based on the original options.mode
                    args: ['process_with_gemini', '--guidelines', guidelineFile],
                    label: `process_with_gemini (guidelines: ${guidelineFile})`
                },
                {
                    cmd: 'anki-cli', // Assuming 'anki-cli' is your executable name
                    args: [finalStepCmd], // Use the determined finalStepCmd
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
