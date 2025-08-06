// D:/Coding/anki-cli/src/commands/question-template.ts
import { Command, InvalidArgumentError } from 'commander';
import clipboardy from 'clipboardy';
import fs from 'fs/promises';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import {
  QUESTION_BLOCK_QUESTION_MARKER,
  QUESTION_BLOCK_EXTRA_MARKER,
  QUESTION_TEMPLATE_HEADER,
} from '../config/anki.js';
import { handleError } from '../utils/errorHandler.js';

function validateCount(value: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('Count must be a positive integer.');
  }
  if (parsed > 500) {
    throw new InvalidArgumentError('Cannot exceed 500');
  }
  return parsed;
}

function generateTemplateBlock(count: number): string {
  let output = QUESTION_TEMPLATE_HEADER;
  for (let i = 1; i <= count; i++) {
    output += `\`\`\`Q-${i}\n${QUESTION_BLOCK_QUESTION_MARKER}\n\n${QUESTION_BLOCK_EXTRA_MARKER}\n\n\`\`\`\n\n`;
  }
  return output;
}

async function writeToFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
  logger.success(`Output written to: ${chalk.cyan(filePath)}`);
}

async function writeToClipboard(content: string, count: number): Promise<void> {
  try {
    await clipboardy.write(content);
    logger.success(`${count} question block template(s) copied to clipboard`);
  } catch (error: unknown) {
    logger.error('Clipboard not available. On Linux, install xclip/xsel.');
    // Throw the error so it can be caught by the action's catch block
    throw error;
  }
}

const questionTemplateCmd = new Command('question-template')
  .description('Generate N question block templates to clipboard or file')
  .argument('<count>', 'Number of question blocks to generate', validateCount)
  .option('--preview', 'Print output to console before copying')
  .option('-o, --output <file>', 'Write output to file instead of clipboard')
  .action(async (count: number, options: { preview?: boolean; output?: string }) => {
    try {
      const content = generateTemplateBlock(count);

      if (options.preview) {
        logger.log(content);
      }

      if (options.output) {
        await writeToFile(options.output, content);
      } else {
        await writeToClipboard(content, count);
      }
    } catch (error) {
      handleError(error);
    }
  });

export default questionTemplateCmd;