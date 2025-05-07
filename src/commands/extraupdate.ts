// src/commands/extraupdate.ts
import fs from "fs/promises";
import path from "path";
import axios, { AxiosError } from 'axios';
import { Command } from 'commander';

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_INPUT_DIR = "D:\\Codes\\anki-utils"; // Default directory for input file
const DEFAULT_INPUT_FILENAME = "output.json";      // Default input filename
const DEFAULT_INITIAL_DELAY_MS = 3000;
const DEFAULT_UPDATE_INTERVAL_MS = 1000;
const DEFAULT_TARGET_ANKI_FIELD = 'Extra';
// ---------------------

// --- Type Definitions ---
interface NoteExtraInfo {
    noteId: number | string; // Allow string for initial read, then parse
    Extra: string; // Field name from input.json
}

export interface ExtraUpdateCommandOptions {
    inputFile?: string; // Full path to input JSON file (overrides dir/filename)
    inputDir?: string;
    filename?: string;
    field?: string; // Target Anki field name
    initialDelay?: number;
    interval?: number;
}

// --- Helper: Delay Function ---
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Helper: AnkiConnect Request (using axios) ---
async function ankiConnectRequest(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action: action,
            version: ANKI_API_VERSION,
            params: params
        }, { timeout: ANKI_REQUEST_TIMEOUT });

        if (response.data.error) {
            throw new Error(`AnkiConnect API Error (${action}): ${response.data.error}`);
        }
        // updateNoteFields returns null on success
        if (action === 'updateNoteFields') {
            return response.data.result; // Should be null
        }
        if (response.data.hasOwnProperty("result")) {
            return response.data.result;
        }
        throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`);
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

// --- Core Processing Logic ---
async function updateAnkiNotesExtra(
    fullInputFilePath: string,
    targetAnkiField: string,
    initialDelayMs: number,
    updateIntervalMs: number
): Promise<void> {
    let notesData: NoteExtraInfo[];

    console.log(`Reading note data from: ${fullInputFilePath}`);
    try {
        const fileContent = await fs.readFile(fullInputFilePath, 'utf8');
        notesData = JSON.parse(fileContent);
        if (!Array.isArray(notesData)) {
            throw new Error("Input file does not contain a valid JSON array.");
        }
        console.log(`Successfully read ${notesData.length} note entries from ${path.basename(fullInputFilePath)}.`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Input file not found: ${fullInputFilePath}. Please ensure the file exists.`);
        }
        throw new Error(`Error reading or parsing ${fullInputFilePath}: ${error.message}`);
    }

    if (notesData.length === 0) {
        console.log("No notes found in the file. Exiting.");
        return;
    }

    if (initialDelayMs > 0) {
        console.log(`\nWaiting for ${initialDelayMs / 1000} seconds before starting updates...`);
        await sleep(initialDelayMs);
    }
    console.log(`Starting Anki note updates for field "${targetAnkiField}"...\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < notesData.length; i++) {
        const note = notesData[i];
        const progressPrefix = `[${i + 1}/${notesData.length}]`;

        if (typeof note?.noteId === 'undefined' || note.noteId === null ||
            typeof note?.Extra !== 'string') { // Expects 'Extra' field from input.json
            console.warn(`${progressPrefix} ⚠️ Skipping entry: Invalid format (noteId or Extra field missing/incorrect type). Entry: ${JSON.stringify(note)}`);
            errorCount++;
            skippedCount++;
            if (i < notesData.length - 1 && updateIntervalMs > 0) await sleep(updateIntervalMs);
            continue;
        }

        const noteId = Number(note.noteId);
        if (isNaN(noteId)) {
            console.warn(`${progressPrefix} ⚠️ Skipping entry: noteId "${note.noteId}" is not a valid number.`);
            errorCount++;
            skippedCount++;
            if (i < notesData.length - 1 && updateIntervalMs > 0) await sleep(updateIntervalMs);
            continue;
        }
        const extraContent = note.Extra; // Content from the 'Extra' field in JSON

        const payload = {
            note: {
                id: noteId,
                fields: {
                    [targetAnkiField]: extraContent // Dynamic field name
                }
            }
        };

        try {
            const result = await ankiConnectRequest("updateNoteFields", payload);
            if (result === null) { // updateNoteFields returns null on success
                 console.log(`${progressPrefix} ✅ noteid: ${noteId} - Field "${targetAnkiField}" updated.`);
                successCount++;
            } else {
                 console.warn(`${progressPrefix} ⚠️ noteid: ${noteId} - Field "${targetAnkiField}" updated (AnkiConnect returned unexpected success response): ${JSON.stringify(result)}`);
                 successCount++; // Assume success if no error reported by AnkiConnect
            }
        } catch (error: any) {
            console.error(`${progressPrefix} ❌ noteid: ${noteId} - Failed to update field "${targetAnkiField}". Error: ${error.message}`);
            errorCount++;
        }

        if (i < notesData.length - 1 && updateIntervalMs > 0) {
            await sleep(updateIntervalMs);
        }
    }

    console.log("\n--- Update Process Finished ---");
    console.log(`Total notes considered: ${notesData.length}`);
    console.log(`Successful updates:     ${successCount}`);
    console.log(`Failed operations:      ${errorCount - skippedCount}`);
    console.log(`Skipped entries:        ${skippedCount}`);
    console.log("-----------------------------");
}

// --- CLI Command Action ---
export async function extraupdateAction(options: ExtraUpdateCommandOptions): Promise<void> {
    let fullInputPath: string;

    if (options.inputFile) {
        fullInputPath = path.resolve(options.inputFile);
    } else {
        const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
        const filename = options.filename || DEFAULT_INPUT_FILENAME;
        fullInputPath = path.join(path.resolve(inputDir), filename);
    }

    const targetField = options.field || DEFAULT_TARGET_ANKI_FIELD;
    const initialDelay = options.initialDelay ?? DEFAULT_INITIAL_DELAY_MS;
    const interval = options.interval ?? DEFAULT_UPDATE_INTERVAL_MS;

    console.log(`Starting update process for Anki field "${targetField}"...`);
    console.log(`Input JSON file: "${fullInputPath}"`);
    console.log(`Initial delay: ${initialDelay / 1000}s, Update interval: ${interval / 1000}s`);

    await updateAnkiNotesExtra(fullInputPath, targetField, initialDelay, interval);
    console.log(`Update process for field "${targetField}" finished.`);
}

// --- Function to register the command with Commander ---
export function registerExtraupdateCommand(program: Command) {
  program
    .command('extraupdate')
    .description('Updates a specified field (default: "Extra") in Anki notes based on an input JSON file.')
    .option('-i, --input-file <filePath>', 'Full path to the input JSON file (overrides --input-dir and --filename).')
    .option('--input-dir <directoryPath>', `Directory of the input JSON file (default: "${DEFAULT_INPUT_DIR}")`)
    .option('--filename <fileName>', `Name of the input JSON file (default: "${DEFAULT_INPUT_FILENAME}")`)
    .option('--field <fieldName>', `The Anki note field to update (default: "${DEFAULT_TARGET_ANKI_FIELD}")`)
    .option('--initial-delay <ms>', `Initial delay before starting updates in milliseconds (default: ${DEFAULT_INITIAL_DELAY_MS})`, s => parseInt(s,10))
    .option('--interval <ms>', `Interval between each AnkiConnect update request in milliseconds (default: ${DEFAULT_UPDATE_INTERVAL_MS})`, s => parseInt(s,10))
    .action(async (options: ExtraUpdateCommandOptions) => {
        await extraupdateAction(options);
    });
}