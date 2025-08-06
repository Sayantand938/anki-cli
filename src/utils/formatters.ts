// src/utils/formatters.ts
import chalk from 'chalk';

/**
 * Generates a formatted progress string like "[01/10]".
 * @param current The current item number.
 * @param total The total number of items.
 * @returns A formatted, colorized string.
 */
export function formatProgress(current: number, total: number): string {
  const padding = String(total).length;
  return chalk.gray(`[${current.toString().padStart(padding, '0')}/${total}]`);
}