// src/utils/logger.ts
import chalk from 'chalk';

// Define the prefixes with their colors
const successPrefix = chalk.green('[OK]');
const infoPrefix = chalk.cyan('[INFO]');
const warnPrefix = chalk.yellow('[WARN]');
const errorPrefix = chalk.red('[ERROR]');

export const logger = {
  // A standard log with no prefix
  log: (message: string) => console.log(message),

  // Methods with formatted prefixes
  info: (message: string) => console.log(`${infoPrefix} ${message}`),
  success: (message: string) => console.log(`${successPrefix} ${message}`),
  warn: (message: string) => console.log(`${warnPrefix} ${message}`),
  
  // Use console.error for actual errors, which writes to stderr
  error: (message: string) => console.error(`${errorPrefix} ${message}`),
};