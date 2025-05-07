import fs from "fs/promises"; // Use promise-based fs for async/await
import path from "path";
import axios, { AxiosError } from 'axios'; // Use axios for HTTP requests
import { Command } from 'commander';

// --- Configuration (Defaults, can be overridden by CLI options) ---
const ANKI_CONNECT_URL = "http://localhost:8765";
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = "Custom Study Session";
const DEFAULT_OUTPUT_DIR = "D:\\Codes\\anki-utils"; // Requested output directory
const DEFAULT_OUTPUT_FILENAME = "input.json"; // Default filename is now input.json
// ---------------------

// --- Type Definitions ---
interface AnkiNoteInfoRaw {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string, order: number }>;
    // modelName: string; // Example of other fields notesInfo might return
    // ... other properties from notesInfo
}

interface TransformedNote {
    noteId: number;
    TokenNo: string;
    Question: string;
    OP1: string;
    OP2: string;
    OP3: string;
    OP4: string;
    Answer: string;
    Extra: string;
    tags: string[];
}

export interface ExportNotesCommandOptions {
    deck?: string;
    outputDir?: string;
    filename?: string;
}

// --- Helper: AnkiConnect Request (using axios, similar to other commands) ---
async function ankiConnectRequest(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action: action,
            version: ANKI_API_VERSION,
            params: params
        }, { timeout: ANKI_REQUEST_TIMEOUT });

        if (response.data.error) {
            if (response.data.error === "collection is not available") {
                throw new Error("AnkiConnect Error: Anki collection is not available. Is Anki open and AnkiConnect installed?");
            } else if (response.data.error.includes("deck not found") || response.data.error.includes("deck was not found")) {
                const deckName = params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name';
                throw new Error(`AnkiConnect Error: Deck "${deckName}" not found.`);
            }
            throw new Error(`AnkiConnect API Error (${action}): ${response.data.error}`);
        }
        if (response.data.hasOwnProperty("result")) {
            return response.data.result;
        } else {
            throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`);
        }
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.isAxiosError) {
            if (axiosError.code === 'ECONNREFUSED') {
                throw new Error(`Connection refused at ${ANKI_CONNECT_URL}. Is Anki open and AnkiConnect installed/enabled?`);
            }
            if (axiosError.response) {
                throw new Error(`AnkiConnect request failed: ${axiosError.message} (Status: ${axiosError.response.status}, Data: ${JSON.stringify(axiosError.response.data)})`);
            } else if (axiosError.request) {
                throw new Error(`AnkiConnect request error: ${axiosError.message}. Check network or AnkiConnect status.`);
            }
        }
        throw error; // Re-throw if not an Axios error or already custom
    }
}

// --- Core Logic ---
async function getAndSaveDeckNotes(
    deckName: string,
    outputFilePath: string
): Promise<void> { // No return value needed, errors will throw

    console.log(`Fetching notes from deck: "${deckName}"...`);
    const notesRaw: AnkiNoteInfoRaw[] = await ankiConnectRequest("notesInfo", {
        query: `deck:"${deckName}"`,
    });

    if (!notesRaw || notesRaw.length === 0) {
        console.log(`No notes found in the "${deckName}" deck. No file will be created.`);
        return;
    }
    console.log(`Found ${notesRaw.length} notes. Transforming data...`);

    const transformedNotes: TransformedNote[] = notesRaw.map((note) => {
        const fields = note.fields;
        return {
            noteId: note.noteId,
            TokenNo: fields.TokenNo?.value ?? "",
            Question: fields.Question?.value ?? "",
            OP1: fields.OP1?.value ?? "",
            OP2: fields.OP2?.value ?? "",
            OP3: fields.OP3?.value ?? "",
            OP4: fields.OP4?.value ?? "",
            Answer: fields.Answer?.value ?? "",
            Extra: fields.Extra?.value ?? "",
            tags: note.tags || [],
        };
    });

    // Ensure output directory exists
    const outputDir = path.dirname(outputFilePath);
    try {
        // fs.mkdir can handle recursive creation and check if exists implicitly
        await fs.mkdir(outputDir, { recursive: true });
        // console.log(`Ensured directory exists: ${outputDir}`); // Optional log
    } catch (dirError: any) {
        // This might be overly cautious if fs.mkdir handles it well, but good for specific errors.
        // EEXIST is the code for "directory already exists", which is fine.
        if (dirError.code !== 'EEXIST') {
             throw new Error(`Error creating output directory "${outputDir}": ${dirError.message}`);
        }
    }

    // Save to JSON file
    try {
        await fs.writeFile(outputFilePath, JSON.stringify(transformedNotes, null, 2));
        console.log(`Details of ${transformedNotes.length} notes have been saved to ${outputFilePath}.`);
    } catch (writeError: any) {
        throw new Error(`Error writing to file "${outputFilePath}": ${writeError.message}`);
    }
}

// --- CLI Command Action ---
export async function exportnotesAction(options: ExportNotesCommandOptions): Promise<void> {
    const deckNameToUse = options.deck || DEFAULT_DECK_NAME;
    const outputDirToUse = options.outputDir || DEFAULT_OUTPUT_DIR;
    // If the user provides a filename, it will be used. Otherwise, it defaults to DEFAULT_OUTPUT_FILENAME ("input.json")
    const outputFilenameToUse = options.filename || DEFAULT_OUTPUT_FILENAME;

    // Resolve the full output path
    const resolvedOutputDir = path.resolve(outputDirToUse);
    const fullOutputFilePath = path.join(resolvedOutputDir, outputFilenameToUse);

    console.log(`Starting notes export...`);
    console.log(`Target Deck: "${deckNameToUse}"`);
    console.log(`Output File: "${fullOutputFilePath}"`); // This will now show "input.json" by default

    // Errors from getAndSaveDeckNotes will propagate to the main CLI error handler in index.ts
    await getAndSaveDeckNotes(deckNameToUse, fullOutputFilePath);

    console.log("Notes export process finished.");
}

// --- Function to register the command with Commander ---
export function registerExportnotesCommand(program: Command) {
  program
    .command('exportnotes')
    .description('Exports notes from a specified Anki deck to a JSON file.')
    .option('-d, --deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
    .option('-o, --output-dir <directoryPath>', `Directory to save the exported JSON file (default: "${DEFAULT_OUTPUT_DIR}")`)
    // The help text for the filename option will reflect the new default
    .option('-f, --filename <fileName>', `Name of the output JSON file (default: "${DEFAULT_OUTPUT_FILENAME}")`)
    .action(async (options: ExportNotesCommandOptions) => {
        await exportnotesAction(options);
    });
}