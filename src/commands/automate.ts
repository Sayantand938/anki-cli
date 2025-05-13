import { Command } from 'commander';
import { execa } from 'execa';

export function registerAutomateCommand(program: Command) {
    program
        .command('automate')
        .description('Runs export_notes → process_with_gemini → [tag_update or extra_update or tag_check.ts] → (token_gen only in tag mode)')
        .option('--mode <type>', 'Specify guidelines mode (e.g. tag, gk, eng, tag_check)', 'tag')
        .action(async (options) => {
            const guidelineMap: Record<string, string> = {
                tag: 'Question Tagging Guidelines.md',
                gk: 'GK Extra field Guidelines.md',
                eng: 'ENG Extra field Guidelines.md',
                tag_check: 'Tag Checking Guidelines.md'
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
                finalStepCmd = 'tag_check';
            } else if (options.mode === 'tag') {
                finalStepCmd = 'tag_update';
            } else {
                finalStepCmd = 'extra_update';
            }

            // Determine the mode to pass to the export_notes command
            const exportNotesMode = options.mode === 'tag_check' ? 'tag' : options.mode;

            const steps = [
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

            // Add token_gen at the end only for tag mode
            if (options.mode === 'tag') {
                steps.push({
                    cmd: 'anki-cli',
                    args: ['token_gen'],
                    label: 'token_gen'
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
