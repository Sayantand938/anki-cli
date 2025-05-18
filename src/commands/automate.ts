import { Command } from 'commander';
import { execa } from 'execa';

export function registerAutomateCommand(program: Command) {
    program
        .command('automate')
        .description('Runs export_notes → process_with_gemini → [tag_update or extra_update or tag_check.ts] → (sl_gen only in tag mode)')
        .option('--mode <type>', 'Specify guidelines mode (e.g. tag, gk, eng, tag_check)', 'tag')
        .action(async (options) => {
            const guidelineMap: Record<string, string> = {
                tag: 'Question Tagging Guidelines.md',
                gk: 'GK Extra field Guidelines.md',
                eng: 'ENG Extra field Guidelines.md',
                tag_check: 'Tag Checking Guidelines.md'
            };

            const guidelineFile = guidelineMap[options.mode];

            if (!guidelineFile && options.mode !== 'tag_check') { // tag_check doesn't strictly need a guideline file for this script
                console.error(`❌ Invalid mode: ${options.mode}`);
                console.error(`Available modes: ${Object.keys(guidelineMap).join(', ')}`);
                process.exit(1);
            }

            // Determine which final update script to run based on the mode
            let finalStepCmd: string;
            if (options.mode === 'tag_check') {
                finalStepCmd = 'tag_check';
            } else if (options.mode === 'tag') {
                finalStepCmd = 'tag_update';
            } else {
                finalStepCmd = 'extra_update';
            }

            // Determine the mode to pass to the export_notes command
            const exportNotesMode = options.mode === 'tag_check' ? 'tag' : options.mode;

            // Define the base steps
            const baseSteps = [
                 {
                    cmd: 'anki-cli',
                    args: ['export_notes', '-m', exportNotesMode],
                    label: `export_notes (mode: ${exportNotesMode})`
                },
                {
                    cmd: 'anki-cli',
                    args: ['process_with_gemini', '--guidelines', guidelineFile],
                    label: `process_with_gemini (guidelines: ${guidelineFile})`
                },
                {
                    cmd: 'anki-cli',
                    args: [finalStepCmd],
                    label: finalStepCmd
                }
            ];

            let steps = [];

            // Add clean_tags as the first step ONLY for tag mode
            if (options.mode === 'tag') {
                 steps.push({
                    cmd: 'anki-cli',
                    args: ['clean_tags'],
                    label: 'clean_tags'
                 });
                 steps = steps.concat(baseSteps); // Add base steps after clean_tags
            } else {
                 steps = baseSteps; // Use only base steps for other modes
            }


            // Add sl_gen at the end only for tag mode
            if (options.mode === 'tag') {
                steps.push({
                    cmd: 'anki-cli',
                    args: ['sl_gen'],
                    label: 'sl_gen'
                });
            }

            for (const step of steps) {
                console.log(`\n🚀 Running: ${step.label}`);

                try {
                    const subprocess = execa(step.cmd, step.args, {
                        stdio: 'inherit'
                    });

                    await subprocess;
                } catch (error: any) {
                    console.error(`❌ Failed: ${step.label}`);
                    console.error(`Error details: ${error.message || error}`);
                    console.error(`Stopping workflow due to error.`);
                    process.exit(1);
                }
            }

            console.log('\n✅ Full automation workflow completed successfully!');
        });
}

