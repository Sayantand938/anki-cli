import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import axios, { AxiosError } from 'axios'; // Import AxiosError for better type checking
import envPaths from 'env-paths'; // Import envPaths
import { readFileSync } from 'fs'; // Needed for getAppNameFromPackageJson

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';

// --- Type Definitions ---
interface VocabUpdateEntry {
    noteId: number;
    'Bengali Meaning'?: string; // Field we're updating - defined as optional
    'Sentence Usage'?: string; // Field we're updating - defined as optional
}

// --- Utility Functions ---

/**
 * Determines the application name from package.json or provides a default.
 * Using the same logic as the other commands for consistency.
 * @returns The application name.
 */
const getAppNameFromPackageJson = (): string => {
    try {
        // Note: __dirname might not be reliable in all JS environments (e.g., bundled code).
        // Consider alternative ways to locate package.json if this causes issues.
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-vocab-updater-default'; // Default name for this specific script
    } catch (error) {
        // Handle errors like file not found or JSON parsing issues
        return 'anki-vocab-updater-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
const applicationPaths = envPaths(APP_NAME, { suffix: '' });

const DATA_DIR = applicationPaths.data;
// Use the data directory for the output.json file
const OUTPUT_FILE = path.join(DATA_DIR, 'output.json');

/**
 * Helper: Delay function
 * @param ms The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Core Logic Functions ---

/**
 * Reads and parses the output JSON file containing vocabulary update entries.
 * Ensures the data directory exists before attempting to read.
 * @param filePath The path to the output JSON file.
 * @returns A promise resolving to an array of VocabUpdateEntry.
 * @throws Error if the file cannot be read or parsed.
 */
async function readVocabUpdateEntries(filePath: string): Promise<VocabUpdateEntry[]> {
    await fs.mkdir(DATA_DIR, { recursive: true }); // Ensure data directory exists
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const entries: VocabUpdateEntry[] = JSON.parse(data);
        return entries;
    } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error(`Error: Input file not found at ${filePath}.`);
            throw new Error(`File not found: ${filePath}`);
        } else if (error instanceof Error && error.name === 'SyntaxError') {
            console.error(`Error: Invalid JSON in ${filePath}.`);
            throw new Error(`Invalid JSON in file: ${filePath}`);
        }
        throw error; // Re-throw other unexpected errors
    }
}

/**
 * Validates if a vocabulary entry has the required "Bengali Meaning" and "Sentence Usage" fields.
 * @param entry The VocabUpdateEntry to validate.
 * @returns True if both required fields are present and not null/undefined, false otherwise.
 */
function isValidVocabEntry(entry: VocabUpdateEntry): boolean {
    return entry['Bengali Meaning'] !== undefined && entry['Bengali Meaning'] !== null &&
           entry['Sentence Usage'] !== undefined && entry['Sentence Usage'] !== null;
}

/**
 * Updates the "Bengali Meaning" and "Sentence Usage" fields for a single Anki note via AnkiConnect.
 * Uses the 'updateNoteFields' action.
 * @param noteId The ID of the note to update.
 * @param bengaliMeaning The new content for the "Bengali Meaning" field.
 * @param sentenceUsage The new content for the "Sentence Usage" field.
 * @returns A promise resolving when the update is complete.
 * @throws Error if the AnkiConnect request fails or returns an error.
 */
async function updateAnkiNoteVocabFields(noteId: number, bengaliMeaning: string, sentenceUsage: string): Promise<void> {
    const payload = {
        action: "updateNoteFields",
        version: 6,
        params: {
            note: {
                id: noteId,
                fields: {
                    'Bengali Meaning': bengaliMeaning.trim(), // Trim whitespace
                    'Sentence Usage': sentenceUsage.trim() // Trim whitespace
                }
            }
        }
    };

    try {
        const response = await axios.post(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        // Check for AnkiConnect-specific errors in the response data
        if (response.data && response.data.error) {
            throw new Error(`AnkiConnect error for note ${noteId}: ${response.data.error}`);
        }

    } catch (error) {
        // Re-throw the error after logging relevant details
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}. Ensure Anki is running and AnkiConnect is active.`);
            } else if (error.response) {
                console.error(`HTTP Error from AnkiConnect for note ${noteId}: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data?.error) {
                    console.error(`AnkiConnect Message: ${error.response.data.error}`);
                } else if (error.response.data) {
                    console.error('AnkiConnect Response Data:', error.response.data);
                }
            } else if (error.request) {
                console.error(`No response received from AnkiConnect for note ${noteId}.`);
            } else {
                console.error(`Axios request error for note ${noteId}: ${error.message}`);
            }
            throw error; // Re-throw the Axios error
        } else {
            // Handle non-Axios errors
            console.error(`An unexpected error occurred during AnkiConnect communication for note ${noteId}: ${error}`);
            throw error; // Re-throw other errors
        }
    }
}

/**
 * Processes an array of vocabulary update entries, updating the "Bengali Meaning" and "Sentence Usage"
 * fields in Anki sequentially. Includes delays between updates.
 * @param entries An array of VocabUpdateEntry.
 * @returns A promise resolving with the counts of successful and failed updates.
 */
async function processVocabUpdates(entries: VocabUpdateEntry[]): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const { noteId, 'Bengali Meaning': bengaliMeaning, 'Sentence Usage': sentenceUsage } = entry;
        const entryIndex = i + 1; // 1-based index for logging

        if (!isValidVocabEntry(entry)) {
            console.log(`[${entryIndex}/${entries.length}] Skipped noteid:${noteId}: Missing "Bengali Meaning" or "Sentence Usage" field.`);
            failureCount++;
            continue;
        }

        // Ensure fields are treated as strings now that we've validated they exist
        const bm = bengaliMeaning as string;
        const su = sentenceUsage as string;

        try {
            await updateAnkiNoteVocabFields(noteId, bm, su);
            console.log(`[${entryIndex}/${entries.length}] noteid:${noteId} updated (Bengali Meaning & Sentence Usage)`);
            successCount++;
        } catch (error) {
            // Error logging is handled within updateAnkiNoteVocabFields
            console.error(`[${entryIndex}/${entries.length}] noteid:${noteId} failed to update (Bengali Meaning & Sentence Usage)`);
            failureCount++;
        }

        // Delay 1 sec between requests, except after the last entry
        if (i < entries.length - 1) {
            await delay(1000);
        }
    }

    return { successCount, failureCount };
}

// --- Command Registration ---

/**
 * Registers the 'vocab_meaning_update' command with the Commander program.
 * @param program The Commander program instance.
 */
export async function registerVocabMeaningUpdateCommand(program: Command) {
    program
        .command('vocab_meaning_update')
        .description('Reads output.json and updates Anki "Bengali Meaning" and "Sentence Usage" fields')
        .action(async () => {
            console.log('Starting Anki vocabulary field update process...');
            // Use path.basename() to display only the filename
            console.log(`Input File: "${path.basename(OUTPUT_FILE)}"`);

            try {
                // Start 3s delay before any action
                await delay(3000);

                // 1. Read and parse input file
                const entries = await readVocabUpdateEntries(OUTPUT_FILE);

                if (entries.length === 0) {
                    console.warn("No entries found in output.json. Nothing to update.");
                    console.log("Status: ✅");
                    return; // Exit successfully if no entries
                }

                console.log(`Count: ${entries.length}`);

                // 2. Process vocabulary field updates sequentially
                const { successCount, failureCount } = await processVocabUpdates(entries);

                // 3. Report final status
                console.log(`Success: ${successCount}/${entries.length}`);
                console.log(`Failure: ${failureCount}`);
                console.log("Status: ✅");

            } catch (error: any) {
                console.error("\nVocabulary field update process failed.");
                console.log("Status: ❌");

                // Specific error handling based on the type of error thrown
                if (error.code === 'ENOENT') {
                    console.error(`File not found: ${error.path}`);
                    console.error(`Please ensure the input file exists at: "${OUTPUT_FILE}". You might need to run a preceding command to generate it.`);
                } else if (error.name === 'SyntaxError') {
                    console.error('Failed to parse output.json:', error.message);
                    console.error(`Please ensure the file "${path.basename(OUTPUT_FILE)}" contains valid JSON.`);
                } else if (error instanceof Error) {
                    console.error(`Error details: ${error.message}`);
                } else {
                    console.error(`An unknown error occurred.`);
                }

                process.exit(1); // Exit with a non-zero status code to indicate failure
            }
        });
}
