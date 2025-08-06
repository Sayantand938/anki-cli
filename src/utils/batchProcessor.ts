// src/utils/batchProcessor.ts
import chalk from 'chalk';
import { createSpinner } from './spinner.js';
import { formatProgress } from './formatters.js';
import { logger } from './logger.js';

interface BatchProcessorOptions<T> {
  items: T[];
  processFn: (item: T) => Promise<boolean>; // Function returns true for success, false for failure
  spinnerMessage: string;
}

interface BatchResult {
  successCount: number;
  totalCount: number;
}

/**
 * Processes an array of items with a shared spinner and progress updates.
 * @param options.items - The array of items to process.
 * @param options.processFn - An async function that processes one item and returns true for success.
 * @param options.spinnerMessage - The base text to display next to the spinner.
 * @returns An object with successCount and totalCount.
 */
export async function processInBatches<T>({
  items,
  processFn,
  spinnerMessage,
}: BatchProcessorOptions<T>): Promise<BatchResult> {
  let successCount = 0;
  const totalCount = items.length;

  if (totalCount === 0) {
    return { successCount: 0, totalCount: 0 };
  }

  const spinner = createSpinner('');
  spinner.start();

  for (let i = 0; i < totalCount; i++) {
    const item = items[i];
    const progress = formatProgress(i + 1, totalCount);
    spinner.setText(`${progress} ${spinnerMessage}...`);

    try {
      const result = await processFn(item);
      if (result) {
        successCount++;
      }
    } catch (err: any) {
      spinner.stop(); // Stop spinner to print the error clearly
      logger.error(`An unexpected error occurred while processing item ${i + 1}: ${err.message}`);
      spinner.start(); // Restart spinner for the next item
    }
  }

  spinner.stop();
  return { successCount, totalCount };
}