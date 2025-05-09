import fs from "fs/promises"; // File system module for reading/writing files asynchronously
import path from "path"; // Utility for handling file and directory paths
import axios, { AxiosError } from 'axios'; // HTTP client for making AnkiConnect requests
import { Command } from 'commander'; // CLI argument parser

// Default settings for AnkiConnect API and output behavior
const ANKI_CONNECT_URL = "http://localhost:8765";
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = "Custom Study Session";
const DEFAULT_OUTPUT_DIR = "D:\\Codes\\anki-utils";
const DEFAULT_OUTPUT_FILENAME = "notes/input.json";
const DELAY_BETWEEN_OPERATIONS_MS = 1000;

// Defines the raw structure returned by AnkiConnect for a note
interface AnkiNoteInfoRaw {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string, order: number }>;
}

// Defines the simplified note structure used for export
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

// Defines CLI options for the export command
export interface ExportNotesCommandOptions {
    deck?: string;
    outputDir?: string;
    filename?: string;
}

// Delays execution for a specified number of milliseconds
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Sends a request to AnkiConnect with error handling and response validation
async function ankiConnectRequest(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action: action,
            version: ANKI_API_VERSION,
            params: params
        }, { timeout: ANKI_REQUEST_TIMEOUT });

        if (response.data.error) {
            // Provide descriptive errors for known AnkiConnect issues
            if (response.data.error === "collection is not available") {
                throw new Error("AnkiConnect Error: Anki collection is not available. Is Anki open and AnkiConnect installed?");
            } else if (response.data.error.includes("deck not found") || response.data.error.includes("deck was not found")) {
                const deckName = params?.query?.match(/deck:"([^"]+)"/)?.[1] || params?.notes?.[0] || 'provided name';
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
        throw error;
    }
}

// Retrieves notes from a deck, transforms their structure, and saves to a JSON file
async function getAndSaveDeckNotes(
    deckName: string,
    outputFilePath: string
): Promise<number> {

    const noteIds: number[] = await ankiConnectRequest("findNotes", {
        query: `deck:"${deckName}"`,
    });

    if (!noteIds || noteIds.length === 0) {
        console.log(`No notes found in deck "${deckName}". File will not be created.`);
        return 0;
    }

    await delay(DELAY_BETWEEN_OPERATIONS_MS);

    const notesRaw: AnkiNoteInfoRaw[] = await ankiConnectRequest("notesInfo", {
        notes: noteIds,
    });

    if (!notesRaw || notesRaw.length === 0) {
        console.log(`Could not retrieve details for notes in "${deckName}". File will not be created.`);
        return 0;
    }

    // Transforms notes into simplified JSON format with field values and original tags
    const transformedNotes: TransformedNote[] = notesRaw.map((note) => {
        const fields = note.fields;
        const processedTags: string[] = note.tags || [];

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
            tags: processedTags,
        };
    });

    const outputDir = path.dirname(outputFilePath);
    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (dirError: any) {
        if (dirError.code !== 'EEXIST') {
             throw new Error(`Error creating output directory "${outputDir}": ${dirError.message}`);
        }
    }

    try {
        await fs.writeFile(outputFilePath, JSON.stringify(transformedNotes, null, 2));
    } catch (writeError: any) {
        throw new Error(`Error writing to file "${outputFilePath}": ${writeError.message}`);
    }

    return transformedNotes.length;
}

// CLI handler for the "exportnotes" command
export async function exportnotesAction(options: ExportNotesCommandOptions): Promise<void> {
    const deckNameToUse = options.deck || DEFAULT_DECK_NAME;
    const outputDirToUse = options.outputDir || DEFAULT_OUTPUT_DIR;
    const outputFilenameToUse = options.filename || DEFAULT_OUTPUT_FILENAME;

    const fullOutputFilePath = path.join(path.resolve(outputDirToUse), outputFilenameToUse);

    const notesProcessedCount = await getAndSaveDeckNotes(
        deckNameToUse,
        fullOutputFilePath
    );

    const tagMode = "original";
    const displayOutputFilename = outputFilenameToUse;

    console.log(`Deck: ${deckNameToUse}`);
    console.log(`Notes: ${notesProcessedCount}`);
    console.log(`Tags: ${tagMode}`);
    if (notesProcessedCount > 0) {
        console.log(`Output: ${displayOutputFilename}`);
        console.log("Export complete.");
    } else {
        console.log("Export finished (no notes were saved).");
    }
}

// Registers the "exportnotes" command with Commander CLI
export function registerExportnotesCommand(program: Command) {
  program
    .command('exportnotes')
    .description('Exports notes from a specified Anki deck to a JSON file.')
    .option('-d, --deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
    .option('-o, --output-dir <directoryPath>', `Directory to save the exported JSON file (default: "${DEFAULT_OUTPUT_DIR}")`)
    .option('-f, --filename <fileName>', `Name of the output JSON file (default: "${DEFAULT_OUTPUT_FILENAME}")`)
    .action(async (options: ExportNotesCommandOptions) => {
        await exportnotesAction(options);
    });
}
