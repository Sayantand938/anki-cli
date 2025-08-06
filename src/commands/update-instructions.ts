// src/commands/update-instructions.ts
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import { INSTRUCTIONS_DIR } from '../config/paths.js';
import { createSpinner } from '../utils/spinner.js';
import { handleError } from '../utils/errorHandler.js';

const updateInstructionsCmd = new Command('update-instructions')
  .description('Update the Instructions folder to app data dir.')
  .action(async () => {
    const spinner = createSpinner('Initializing...');
    try {
      const __filename = fileURLToPath(import.meta.url);
      const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
      const sourcePath = path.join(projectRoot, 'Instructions');

      spinner.start(`Checking for source directory: ${chalk.gray(sourcePath)}`);
      try {
        const stats = await fs.stat(sourcePath);
        if (!stats.isDirectory()) throw new Error('Source path is not a directory.');
      } catch (err: any) {
        throw new Error(`Missing or invalid 'Instructions' directory at source: ${err.message}`);
      }

      spinner.setText('Preparing target directory...');
      await fs.mkdir(path.dirname(INSTRUCTIONS_DIR), { recursive: true });
      await fs.rm(INSTRUCTIONS_DIR, { recursive: true, force: true });

      spinner.setText('Copying instruction files...');
      // Use the modern, built-in fs.cp for recursive copying
      await fs.cp(sourcePath, INSTRUCTIONS_DIR, { recursive: true });

      spinner.stop();
      logger.success(`Instructions updated successfully at ${chalk.gray(INSTRUCTIONS_DIR)}`);
    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

export default updateInstructionsCmd;