import { Command } from 'commander';
import axios, { AxiosError } from 'axios'; // Import AxiosError for better type checking
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import envPaths from 'env-paths';

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const TARGET_ANKI_DECK_NAME = "Custom Study Session";

// --- Type Definitions ---
interface AnkiConnectNoteInfo {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string; order: number }>;
    modelName: string;
    cards: number[];
}

interface AnkiConnectResponse {
    result: AnkiConnectNoteInfo[] | null;
    error: string | null;
}

// Define interfaces for specific modes
interface TagModeNote {
    noteId: number;
    Question: string;
    Tags: string[];
}

interface GkModeNote {
    noteId: number;
    Question: string;
    Extra: string;
}

interface EngModeNote {
    noteId: number;
    Question: string;
    OP1: string;
    OP2: string;
    OP3: string;
    OP4: string;
    Answer: string;
    Tags: string[];
}

interface FullModeNote {
    noteId: number;
    TokenNo: string;
    Question: string;
    OP1: string;
    OP2: string;
    OP3: string;
    OP4: string;
    Answer: string;
    Extra: string;
    Tags: string[];
}


// Union type for transformed notes based on mode
type TransformedNote = TagModeNote | GkModeNote | EngModeNote | FullModeNote;

// Define the possible modes
type ExportMode = 'tag' | 'gk' | 'eng' | 'full';

// --- Utility Functions ---

/**
 * Determines the application name from package.json or provides a default.
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
        return 'anki-note-exporter-default';
    } catch (error) {
        // Handle errors like file not found or JSON parsing issues
        // console.warn(`Could not read package.json to determine app name. Using default: anki-note-exporter-default. Error: ${error}`); // Reduced output
        return 'anki-note-exporter-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
const applicationPaths = envPaths(APP_NAME, { suffix: '' });

const OUTPUT_DIR = applicationPaths.data;
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'input.json');

// --- Core Logic Functions ---

/**
 * Fetches notes from AnkiConnect for a specific deck.
 * @param deckName The name of the Anki deck to query.
 * @returns A Promise resolving to an array of AnkiConnectNoteInfo.
 * @throws AxiosError if the HTTP request fails, or Error if AnkiConnect returns an error.
 */
async function fetchNotesFromAnki(deckName: string): Promise<AnkiConnectNoteInfo[]> {
    // console.log(`Attempting to fetch notes from AnkiConnect for deck "${deckName}"...`); // Reduced output

    const payload = {
        action: "notesInfo",
        version: 6,
        params: {
            query: `deck:"${deckName}"`
        }
    };

    try {
        const response = await axios.post<AnkiConnectResponse>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data.error) {
            // AnkiConnect returned an error message
            throw new Error(`AnkiConnect error: ${response.data.error}. Ensure Anki is running, AnkiConnect is installed, and the deck "${deckName}" exists.`);
        }

        // Return empty array if result is null or empty
        return response.data.result || [];

    } catch (error) {
        // Re-throw the error after logging relevant details
        if (axios.isAxiosError(error)) {
             if (error.code === 'ECONNREFUSED') {
                console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}.`);
                console.error('Ensure Anki is running and AnkiConnect is active.');
            } else if (error.response) {
                console.error(`HTTP Error from AnkiConnect: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data?.error) {
                    console.error(`AnkiConnect Message: ${error.response.data.error}`);
                } else if (error.response.data) {
                    console.error('AnkiConnect Response Data:', error.response.data);
                }
            } else if (error.request) {
                console.error(`No response received from AnkiConnect.`);
            } else {
                 console.error(`Axios request error: ${error.message}`);
            }
            throw error; // Re-throw the Axios error
        } else {
            // Handle non-Axios errors
            console.error(`An unexpected error occurred during AnkiConnect communication: ${error}`);
            throw error; // Re-throw other errors
        }
    }
}

/**
 * Transforms AnkiConnect note data into the desired output format based on the selected mode.
 * @param notes An array of AnkiConnectNoteInfo.
 * @param mode The export mode ('tag', 'gk', 'eng', 'full').
 * @returns An array of TransformedNote objects.
 */
function transformAnkiNotes(notes: AnkiConnectNoteInfo[], mode: ExportMode): TransformedNote[] {
    console.log(`Transforming ${notes.length} notes with mode: ${mode}...`);
    return notes.map(note => {
        const { noteId, fields, tags } = note;

        // Helper to safely get field value
        const getFieldValue = (fieldName: string): string => {
            return fields[fieldName]?.value ?? '';
        };

        switch (mode) {
            case 'tag':
                return {
                    noteId: noteId,
                    Question: getFieldValue('Question'),
                    Tags: tags,
                } as TagModeNote;
            case 'gk':
                return {
                    noteId: noteId,
                    Question: getFieldValue('Question'),
                    Extra: getFieldValue('Extra'),
                } as GkModeNote;
            case 'eng':
                return {
                    noteId: noteId,
                    Question: getFieldValue('Question'),
                    OP1: getFieldValue('OP1'),
                    OP2: getFieldValue('OP2'),
                    OP3: getFieldValue('OP3'),
                    OP4: getFieldValue('OP4'),
                    Answer: getFieldValue('Answer'),
                    Tags: tags,
                } as EngModeNote;
            case 'full':
            default:
                return {
                    noteId: noteId,
                    TokenNo: getFieldValue('TokenNo'),
                    Question: getFieldValue('Question'),
                    OP1: getFieldValue('OP1'),
                    OP2: getFieldValue('OP2'),
                    OP3: getFieldValue('OP3'),
                    OP4: getFieldValue('OP4'),
                    Answer: getFieldValue('Answer'),
                    Extra: getFieldValue('Extra'),
                    Tags: tags,
                } as FullModeNote;
        }
    });
}

/**
 * Writes the transformed notes data to a JSON file.
 * Creates the output directory if it doesn't exist.
 * @param notes An array of TransformedNote objects.
 * @param outputPath The full path to the output file.
 * @param outputDir The directory containing the output file.
 * @throws Error if writing the file fails.
 */
async function writeOutputToFile(notes: TransformedNote[], outputPath: string, outputDir: string): Promise<void> {
    // console.log(`Writing data to output file: ${path.relative(process.cwd(), outputPath).replace(/\//g, '\\')}...`); // Reduced output
    try {
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputPath, JSON.stringify(notes, null, 2));
        // console.log(`Successfully wrote ${notes.length} notes.`); // Reduced output
    } catch (error) {
         if (error instanceof Error && (error.message?.includes('EACCES') || error.message?.includes('EPERM'))) {
            console.error(`Permission denied. Cannot create directory: ${outputDir} or write to file: ${outputPath}`);
        } else if (error instanceof Error && error.message?.includes('ENOENT') && (error.message?.includes(outputDir) || error.message?.includes(outputPath))) {
            console.error(`Cannot create directory: ${outputDir} or write to file: ${outputPath}. Path component missing.`);
        } else {
            console.error(`Error writing output file: ${error}`);
        }
        throw error; // Re-throw the error for the caller to handle status logging
    }
}

// --- Command Registration ---

/**
 * Registers the 'export_notes' command with the Commander program.
 * @param program The Commander program instance.
 */
export function registerExportNotesCommand(program: Command) {
    program
        .command('export_notes')
        .description(`Exports notes from Anki deck "${TARGET_ANKI_DECK_NAME}"`)
        .option('-m, --mode <mode>', 'Export mode: tag, gk, eng, full', 'full') // Added --mode option with default 'full'
        .action(async (options) => { // Access options here
            const mode: ExportMode = options.mode.toLowerCase(); // Get the selected mode

            // Validate the mode
            const validModes: ExportMode[] = ['tag', 'gk', 'eng', 'full'];
            if (!validModes.includes(mode)) {
                console.error(`Invalid mode "${mode}". Valid modes are: ${validModes.join(', ')}`);
                process.exit(1);
            }

            console.log('Starting note export process...');
            console.log(`Target Deck: "${TARGET_ANKI_DECK_NAME}"`);
            console.log(`Export Mode: "${mode}"`); // Log the selected mode
            // Use path.basename() to display only the filename
            console.log(`Output File: "${path.basename(OUTPUT_FILE)}"`);

            try {
                // 1. Fetch notes from AnkiConnect
                const ankiNotes = await fetchNotesFromAnki(TARGET_ANKI_DECK_NAME);

                if (ankiNotes.length === 0) {
                    console.warn(`No notes found in deck "${TARGET_ANKI_DECK_NAME}".`);
                    // Still write an empty array to the file
                    await writeOutputToFile([], OUTPUT_FILE, OUTPUT_DIR);
                    console.log(`Count: 0`); // Explicitly show count is 0
                    console.log(`Status: ✅ No notes exported, empty file created.`);
                    return; // Exit successfully
                }

                // 2. Transform the fetched notes based on the mode
                const transformedNotes = transformAnkiNotes(ankiNotes, mode);

                // 3. Write the transformed notes to a file
                await writeOutputToFile(transformedNotes, OUTPUT_FILE, OUTPUT_DIR);

                console.log(`Count: ${transformedNotes.length}`);
                console.log(`Status: ✅`);

            } catch (error) {
                // Generic error handler for the entire process
                console.error(`\nExport process failed.`);
                 if (error instanceof Error) {
                     console.error(`Error details: ${error.message}`);
                 } else {
                     console.error(`An unknown error occurred.`);
                 }
                console.log(`Status: ❌`);
                process.exit(1); // Exit with a non-zero status code to indicate failure
            }
        });
}
