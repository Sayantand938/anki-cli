// src/commands/clear_field.ts
import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
import envPaths from 'env-paths'; // Keep import, though not strictly used for file paths here
import { readFileSync } from 'fs'; // Needed for getAppNameFromPackageJson
import path from 'path';

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const TARGET_ANKI_DECK_NAME = "Custom Study Session"; // Define the target deck

// --- Utility Functions ---

/**
 * Determines the application name from package.json or provides a default.
 * Using the same logic as the other commands for consistency.
 * @returns The application name.
 */
const getAppNameFromPackageJson = (): string => {
    try {
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-field-clearer-default'; // Default name for this specific script
    } catch (error) {
        // console.warn(`Could not read package.json to determine app name. Using default: anki-field-clearer-default. Error: ${error}`); // Reduced output
        return 'anki-field-clearer-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
// envPaths is not strictly needed for this command as it doesn't use files,
// but keeping the pattern is fine.
// const applicationPaths = envPaths(APP_NAME, { suffix: '' });

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
 * Fetches the IDs of notes within a specific Anki deck.
 * Uses the 'findNotes' AnkiConnect action with a deck-specific query.
 * @param deckName The name of the Anki deck to query.
 * @returns A Promise resolving to an array of note IDs (numbers).
 * @throws AxiosError if the HTTP request fails, or Error if AnkiConnect returns an error.
 */
async function getNoteIdsInDeck(deckName: string): Promise<number[]> {
    console.log(`Attempting to fetch note IDs from AnkiConnect for deck "${deckName}"...`);

    // **Step 1: Use findNotes action to get note IDs in the target deck**
    const payload = {
        action: "findNotes",
        version: 6,
        // Query specifically for notes in the target deck
        params: {
            query: `deck:"${deckName}"`
        }
    };

    try {
        const response = await axios.post<{ result: number[] | null; error: string | null }>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data.error) {
            // AnkiConnect returned an error message
            throw new Error(`AnkiConnect error finding notes in deck "${deckName}": ${response.data.error}. Ensure Anki is running, AnkiConnect is installed, and the deck exists.`);
        }

        // Return empty array if result is null or empty
        return response.data.result || [];

    } catch (error) {
        // Re-throw the error after logging relevant details
        if (axios.isAxiosError(error)) {
             if (error.code === 'ECONNREFUSED') {
                console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}. Ensure Anki is running and AnkiConnect is active.`);
            } else if (error.response) {
                console.error(`HTTP Error from AnkiConnect (findNotes) for deck "${deckName}": ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data?.error) {
                     // Use the error message from the AnkiConnect response if available
                    console.error(`AnkiConnect Message: ${error.response.data.error}`);
                } else if (error.response.data) {
                    console.error('AnkiConnect Response Data:', error.response.data);
                }
            } else if (error.request) {
                console.error(`No response received from AnkiConnect (findNotes) for deck "${deckName}".`);
            } else {
                 console.error(`Axios request error (findNotes) for deck "${deckName}": ${error.message}`);
            }
            throw error; // Re-throw the Axios error
        } else {
            // Handle non-Axios errors
            console.error(`An unexpected error occurred during AnkiConnect communication (findNotes) for deck "${deckName}": ${error}`);
            throw error; // Re-throw other errors
        }
    }
}


/**
 * Updates a specific field to an empty string for a single Anki note via AnkiConnect.
 * Uses the 'updateNoteFields' action.
 * @param noteId The ID of the note to update.
 * @param fieldName The name of the field to clear.
 * @returns A promise resolving when the update is complete.
 * @throws Error if the AnkiConnect request fails or returns an error.
 */
async function clearAnkiNoteField(noteId: number, fieldName: string): Promise<void> {
    // **Step 2: Use updateNoteFields action for each note ID**
    const payload = {
        action: "updateNoteFields",
        version: 6,
        params: {
            note: {
                id: noteId,
                fields: {
                    // Use a computed property name to set the specified field
                    [fieldName]: "" // Set the field to an empty string
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
             throw new Error(`AnkiConnect error for note ${noteId}, field "${fieldName}": ${response.data.error}`);
        }

    } catch (error) {
        // Re-throw the error after logging relevant details
        if (axios.isAxiosError(error)) {
             if (error.code === 'ECONNREFUSED') {
                console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}. Ensure Anki is running and AnkiConnect is active.`);
            } else if (error.response) {
                console.error(`HTTP Error from AnkiConnect (updateNoteFields) for note ${noteId}, field "${fieldName}": ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data?.error) {
                     // Use the error message from the AnkiConnect response if available
                    console.error(`AnkiConnect Message: ${error.response.data.error}`);
                } else if (error.response.data) {
                    console.error('AnkiConnect Response Data:', error.response.data);
                }
            } else if (error.request) {
                console.error(`No response received from AnkiConnect (updateNoteFields) for note ${noteId}, field "${fieldName}".`);
            } else {
                 console.error(`Axios request error (updateNoteFields) for note ${noteId}, field "${fieldName}": ${error.message}`);
            }
            throw error; // Re-throw the Axios error
        } else {
            // Handle non-Axios errors
            console.error(`An unexpected error occurred during AnkiConnect communication (updateNoteFields) for note ${noteId}, field "${fieldName}": ${error}`);
            throw error; // Re-throw other errors
        }
    }
}

/**
 * Processes the clearing of a specified field for all notes.
 * Includes delays between updates.
 * @param noteIds An array of note IDs to process.
 * @param fieldName The name of the field to clear.
 * @returns A promise resolving with the counts of successful and failed updates.
 */
async function processFieldClearing(noteIds: number[], fieldName: string): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    // **Step 2 (part 2): Iterate through the fetched note IDs**
    for (let i = 0; i < noteIds.length; i++) {
        const noteId = noteIds[i];
        const entryIndex = i + 1; // 1-based index for logging

        try {
            // Attempt to clear the field for this note
            await clearAnkiNoteField(noteId, fieldName);
            console.log(`[${entryIndex}/${noteIds.length}] Cleared field "${fieldName}" for noteid:${noteId}`);
            successCount++;
        } catch (error) {
            // Error logging for this specific note/field is handled within clearAnkiNoteField
             console.error(`[${entryIndex}/${noteIds.length}] Failed to clear field "${fieldName}" for noteid:${noteId} (see error details above)`);
            failureCount++;
        }

        // **Use delay as used in other codes**
        // Delay 100ms between requests to avoid overwhelming AnkiConnect
        if (i < noteIds.length - 1) {
            await delay(100);
        }
    }

    return { successCount, failureCount };
}

// --- Command Registration ---

/**
 * Registers the 'clear-field' command with the Commander program.
 * @param program The Commander program instance.
 */
export function registerClearFieldCommand(program: Command) {
    program
        .command('clear-field') // No positional argument anymore
        .description(`Clears the content of the specified field for all notes in the "${TARGET_ANKI_DECK_NAME}" deck`) // Update description
        .option('-f, --field <fieldName>', 'The name of the Anki note field to clear', '') // Define the option with a value placeholder '<fieldName>'
        .action(async (options) => { // Action receives the options object
            const fieldName = options.field; // Access the field name from options

            console.log('Starting Anki field clearing process...');
            console.log(`Target Deck: "${TARGET_ANKI_DECK_NAME}"`); // Log the target deck

            // --- Mandatory Field Name Check ---
            if (!fieldName || fieldName.trim() === '') {
                 console.error("Error: The --field option is required and cannot be empty.");
                 console.log("Status: ❌");
                 // Find the specific command and output its help
                 program.commands.find(cmd => cmd.name() === 'clear-field')?.outputHelp();
                 process.exit(1);
            }
            console.log(`Target Field: "${fieldName}"`);
            // --- End Mandatory Check ---


            try {
                 // Start 3s delay before any action - good practice before multiple API calls
                await delay(3000);

                // 1. Fetch note IDs ONLY from the target deck using getNoteIdsInDeck
                const noteIds = await getNoteIdsInDeck(TARGET_ANKI_DECK_NAME);

                if (noteIds.length === 0) {
                    console.warn(`No notes found in deck "${TARGET_ANKI_DECK_NAME}".`);
                    console.log("Status: ✅ No notes to update.");
                    return; // Exit successfully if no notes
                }

                console.log(`Found ${noteIds.length} notes in "${TARGET_ANKI_DECK_NAME}".`); // Update count message

                // 2. Process clearing the field for each note using processFieldClearing
                const { successCount, failureCount } = await processFieldClearing(noteIds, fieldName);

                // 3. Report final status
                console.log(`\nSummary:`);
                console.log(`Processed: ${noteIds.length} notes in "${TARGET_ANKI_DECK_NAME}"`); // Update summary message
                console.log(`Success: ${successCount}`);
                console.log(`Failure: ${failureCount}`);
                console.log("Status: ✅");

            } catch (error: any) {
                console.error("\nField clearing process failed.");
                console.log("Status: ❌");

                // Error logging is handled within the specific fetch/update functions
                 if (error instanceof Error) {
                     // Generic catch-all log if specific handlers missed something critical
                     // console.error(`Overall process error: ${error.message}`); // Keep this minimal
                 } else {
                     // console.error(`Overall unknown error: ${error}`);
                 }

                process.exit(1); // Exit with a non-zero status code to indicate failure
            }
        });
}