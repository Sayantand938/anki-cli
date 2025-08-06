// src/commands/automate.ts
import { Command, Option } from 'commander';
import { execa } from 'execa';

const automateCmd = new Command('automate')
  .description('Run a sequence of commands for a workflow')
  .addOption(
    new Option('--mode <mode>', 'Workflow mode').choices(['gk', 'eng', 'tag']).makeOptionMandatory()
  )
  .action(async ({ mode }: { mode: 'gk' | 'eng' | 'tag' }) => {
    // The workflows object now includes the --cleanup flag for the process-with-ai step.
    const workflows: Record<string, { title: string; args: string[] }[]> = {
      eng: [
        { title: 'Step 1: Fetching Notes', args: ['fetch-notes'] },
        {
          title: 'Step 2: Processing with AI',
          args: ['process-with-ai', '--instruction', '1.md', '--cleanup'],
        },
        { title: 'Step 3: Updating in Anki', args: ['update-extra'] },
      ],
      gk: [
        { title: 'Step 1: Fetching Notes', args: ['fetch-notes'] },
        {
          title: 'Step 2: Processing with AI',
          args: ['process-with-ai', '--instruction', '2.md', '--cleanup'],
        },
        { title: 'Step 3: Updating in Anki', args: ['update-extra'] },
      ],
      tag: [
        { title: 'Step 1: Fetching Notes', args: ['fetch-notes'] },
        {
          title: 'Step 2: Processing with AI',
          args: ['process-with-ai', '--instruction', '4.md', '--cleanup'],
        },
        { title: 'Step 3: Updating in Anki', args: ['update-tag'] },
      ],
    };

    for (const step of workflows[mode]) {
      console.log('-----------------------------------');
      console.log(step.title);
      console.log('-----------------------------------');

      try {
        // We now call the command by its registered name from package.json
        await execa('anki-cli', step.args, { stdio: 'inherit' });
      } catch {
        process.exit(1);
      }
    }
  });

export default automateCmd;