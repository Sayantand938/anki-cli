// D:/Coding/anki-cli/src/utils/file-utils.ts
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { DATA_DIR } from '../config/paths.js';
import { OUTPUT_JSON_FILENAME } from '../config/app.js';

/**
 * Gets the full, absolute path to the output data file.
 * @returns {string} The file path.
 */
export function getOutputDataFilePath(): string {
  return path.join(DATA_DIR, OUTPUT_JSON_FILENAME);
}

/**
 * Writes data to a JSON file with pretty formatting.
 * @param filePath The path to the file to write.
 * @param data The JavaScript object or array to write.
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Reads and parses a JSON file that is expected to contain an array.
 * Provides standardized error handling for common issues.
 * @template T - The expected type of objects within the array.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Promise<T[]>} A promise that resolves to the parsed array of objects.
 */
export async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const records: unknown = JSON.parse(data);

    if (!Array.isArray(records)) {
      const fileName = chalk.cyan(path.basename(filePath));
      throw new Error(`Invalid format in ${fileName}. Expected a JSON array.`);
    }
    return records as T[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${chalk.dim(filePath)}`);
    }
    if (error instanceof SyntaxError) {
      const fileName = chalk.cyan(path.basename(filePath));
      throw new Error(`Invalid JSON in ${fileName}: ${error.message}`);
    }
    // Re-throw other errors to be handled by the caller
    throw error;
  }
}