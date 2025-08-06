#!/usr/bin/env node
import { program, Command } from 'commander';
import { handleError } from './utils/errorHandler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// The dotenv import and the conditional if block have been completely removed.

// Catch unhandled promise rejections
process.on('unhandledRejection', handleError);

async function main() {
  try {
    program
      .name('anki-cli')
      .description('A simple CLI tool with dynamic command loading');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = await fs.readdir(commandsDir);

    for (const file of commandFiles) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        if(file.endsWith('.map')) continue;

        const commandPath = path.join(commandsDir, file);
        const commandURL = pathToFileURL(commandPath);
        const { default: command } = await import(commandURL.href);
        
        if (command instanceof Command) {
          program.addCommand(command);
        }
      }
    }

    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }
}

main();