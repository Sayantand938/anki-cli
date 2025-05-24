import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import axios, { AxiosError } from 'axios'; // Import AxiosError for better type checking
import envPaths from 'env-paths'; // Import envPaths
import { readFileSync } from 'fs'; // Needed for getAppNameFromPackageJson

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';

// --- Type Definitions ---
interface GeminiExtraEntry {
    noteId: number;
    Extra?: string; // Field we're updating - defined as optional
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
        return 'anki-extra-updater-default'; // Default name for this specific script
    } catch (error) {
        // Handle errors like file not found or JSON parsing issues
        // console.warn(`Could not read package.json to determine app name. Using default: anki-extra-updater-default. Error: ${error}`); // Reduced output
        return 'anki-extra-updater-default';
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
 * Reads and parses the output JSON file containing extra field update entries.
 * Ensures the data directory exists before attempting to read.
 * @param filePath The path to the output JSON file.
 * @returns A promise resolving to an array of GeminiExtraEntry.
 * @throws Error if the file cannot be read or parsed.
 */
async function readExtraUpdateEntries(filePath: string): Promise<GeminiExtraEntry[]> {
    await fs.mkdir(DATA_DIR, { recursive: true }); // Ensure data directory exists
    const data = await fs.readFile(filePath, 'utf-8');
    const entries: GeminiExtraEntry[] = JSON.parse(data);
    return entries;
}

/**
 * Validates if an extra entry has the required "Extra" field.
 * @param entry The GeminiExtraEntry to validate.
 * @returns True if the "Extra" field is present and not null/undefined, false otherwise.
 */
function isValidExtraEntry(entry: GeminiExtraEntry): boolean {
    // Check if the 'Extra' property exists and is not null or undefined
    return entry.Extra !== undefined && entry.Extra !== null;
}

/**
 * Updates the "Extra" field for a single Anki note via AnkiConnect.
 * Uses the 'updateNoteFields' action.
 * @param noteId The ID of the note to update.
 * @param extraContent The new content for the "Extra" field.
 * @returns A promise resolving when the update is complete.
 * @throws Error if the AnkiConnect request fails or returns an error.
 */
async function updateAnkiNoteExtraField(noteId: number, extraContent: string): Promise<void> {
    const payload = {
        action: "updateNoteFields",
        version: 6,
        params: {
            note: {
                id: noteId,
                fields: {
                    Extra: extraContent.trim() // Trim whitespace from the content
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
 * Processes an array of extra field update entries, updating the "Extra" field in Anki sequentially.
 * Includes delays between updates.
 * @param entries An array of GeminiExtraEntry.
 * @returns A promise resolving with the counts of successful and failed updates.
 */
async function processExtraUpdates(entries: GeminiExtraEntry[]): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const { noteId, Extra } = entry;
        const entryIndex = i + 1; // 1-based index for logging

        if (!isValidExtraEntry(entry)) {
            console.log(`[${entryIndex}/${entries.length}] Skipped noteid:${noteId}: Missing "Extra" field`);
            failureCount++;
            continue;
        }

        // Ensure Extra is treated as a string now that we've validated it exists
        const extraContent = Extra as string;

        try {
            await updateAnkiNoteExtraField(noteId, extraContent);
            console.log(`[${entryIndex}/${entries.length}] noteid:${noteId} updated (Extra field)`);
            successCount++;
        } catch (error) {
            // Error logging is handled within updateAnkiNoteExtraField
            console.error(`[${entryIndex}/${entries.length}] noteid:${noteId} failed to update (Extra field)`);
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
 * Registers the 'extra_update' command with the Commander program.
 * @param program The Commander program instance.
 */
export async function registerExtraUpdateCommand(program: Command) {
    program
        .command('extra_update')
        .description('Reads output.json and updates Anki "Extra" field')
        .action(async () => {
            console.log('Starting Anki extra field update process...');
            // Use path.basename() to display only the filename
            console.log(`Input File: "${path.basename(OUTPUT_FILE)}"`);

            try {
                 // Start 3s delay before any action
                await delay(3000);

                // 1. Read and parse input file
                const entries = await readExtraUpdateEntries(OUTPUT_FILE);

                if (entries.length === 0) {
                    console.warn("No entries found in output.json. Nothing to update.");
                    console.log("Status: ✅");
                    return; // Exit successfully if no entries
                }

                console.log(`Count: ${entries.length}`);

                // 2. Process extra field updates sequentially
                const { successCount, failureCount } = await processExtraUpdates(entries);

                // 3. Report final status
                console.log(`Success: ${successCount}/${entries.length}`);
                console.log(`Failure: ${failureCount}`);
                console.log("Status: ✅");

            } catch (error: any) {
                console.error("\nExtra field update process failed.");
                console.log("Status: ❌");

                // Specific error handling based on the type of error thrown
                if (error.code === 'ENOENT') {
                    console.error(`File not found: ${error.path}`);
                    console.error(`Please ensure the input file exists at: "${OUTPUT_FILE}". You might need to run the 'process_with_gemini' command first.`);
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
