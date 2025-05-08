// src/commands/tagupdate.ts (or the file previously named tagreplace.ts)
import fs from "fs/promises";
import path from "path";
import axios, { AxiosError } from 'axios';
import { Command } from 'commander';

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_INPUT_DIR = "D:\\Codes\\anki-utils";
const DEFAULT_INPUT_FILENAME = "output.json";
const DEFAULT_INITIAL_DELAY_MS = 3000;
const DEFAULT_PER_REQUEST_DELAY_MS = 1000;
// ---------------------

// --- Type Definitions ---
interface NoteTagInfo {
    noteId: number | string;
    chosenTag: string;
}

export interface TagUpdateCommandOptions { // Renamed interface
    inputFile?: string;
    inputDir?: string;
    filename?: string;
    initialDelay?: number;
    requestDelay?: number;
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
        if (action === 'replaceTags') { // Specific to this command's core Anki action
             return response.data.result;
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
async function processNoteTagsAndUpdate( // Renamed for clarity if desired
    fullInputFilePath: string,
    initialDelayMs: number,
    perRequestDelayMs: number
): Promise<void> {
    let noteData: NoteTagInfo[];

    console.log(`Reading note tag data from ${fullInputFilePath}...`);
    try {
        const fileContent = await fs.readFile(fullInputFilePath, 'utf-8');
        noteData = JSON.parse(fileContent);
        if (!Array.isArray(noteData)) {
            throw new Error("Input file does not contain a valid JSON array.");
        }
        console.log(`Successfully read ${noteData.length} note entries.`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Input file not found: ${fullInputFilePath}. Please ensure the file exists.`);
        }
        throw new Error(`Error reading or parsing ${fullInputFilePath}: ${error.message}`);
    }

    if (noteData.length === 0) {
        console.log("No note data found in the file. Exiting.");
        return;
    }

    if (initialDelayMs > 0) {
        console.log(`\nPausing for ${initialDelayMs / 1000} seconds before starting updates...`);
        await sleep(initialDelayMs);
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const totalNotes = noteData.length;

    console.log("\nStarting note tag updates..."); // Changed log message
    for (let i = 0; i < totalNotes; i++) {
        const noteInfo = noteData[i];
        const progressPrefix = `[${i + 1}/${totalNotes}]`;

        if (typeof noteInfo.noteId === 'undefined' || noteInfo.noteId === null ||
            typeof noteInfo.chosenTag !== 'string' || !noteInfo.chosenTag.trim()) {
            console.log(`${progressPrefix} ⚠️ Skipping invalid entry: Missing or invalid noteId/chosenTag. Entry: ${JSON.stringify(noteInfo)}`);
            errorCount++;
            skippedCount++;
            if (i < totalNotes - 1 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
            continue;
        }

        const noteId = Number(noteInfo.noteId);
        if (isNaN(noteId)) {
            console.log(`${progressPrefix} ⚠️ Skipping invalid entry: noteId "${noteInfo.noteId}" is not a valid number.`);
            errorCount++;
            skippedCount++;
            if (i < totalNotes - 1 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
            continue;
        }
        const chosenTag = noteInfo.chosenTag.trim();

        const tagParts = chosenTag.split('::');
        if (tagParts.length < 1 || !tagParts[0]) {
            console.log(`${progressPrefix} ⚠️ Skipping Note ID ${noteId}: chosenTag "${chosenTag}" has no valid first part (subject).`);
            errorCount++;
            skippedCount++;
            if (i < totalNotes - 1 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
            continue;
        }
        const tagToReplace = tagParts[0];
        const replaceWithTag = chosenTag;

        const params = {
            notes: [noteId],
            tag_to_replace: tagToReplace,
            replace_with_tag: replaceWithTag
        };

        try {
            const result = await ankiConnectRequest('replaceTags', params);
            if (result === null) {
                // --- MODIFIED LINE BELOW ---
                console.log(`${progressPrefix} ✅ noteid: ${noteId} updated with tag ${replaceWithTag}`);
                successCount++;
            } else {
                 console.log(`${progressPrefix} ⚠️ noteid: ${noteId} - AnkiConnect 'replaceTags' returned unexpected result: ${JSON.stringify(result)}`);
                 errorCount++;
            }
        } catch (error: any) {
             console.log(`${progressPrefix} ❌ noteid: ${noteId} - Failed to update tags for "${tagToReplace}" with "${replaceWithTag}". Error: ${error.message}`);
            errorCount++;
        }

        if (i < totalNotes - 1 && perRequestDelayMs > 0) {
            await sleep(perRequestDelayMs);
        }
    }

    console.log("\n--- Tag Update Complete ---"); // Changed log message
    console.log(`Successfully updated:   ${successCount} notes.`); // Changed log message
    console.log(`Failed operations:    ${errorCount - skippedCount} notes.`);
    console.log(`Skipped entries:      ${skippedCount} notes.`);
    console.log(`Total attempted:      ${totalNotes}`);
    console.log("---------------------------");
}

// --- CLI Command Action ---
export async function tagupdateAction(options: TagUpdateCommandOptions): Promise<void> { // Renamed action
    let fullInputPath: string;

    if (options.inputFile) {
        fullInputPath = path.resolve(options.inputFile);
    } else {
        const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
        const filename = options.filename || DEFAULT_INPUT_FILENAME;
        fullInputPath = path.join(path.resolve(inputDir), filename);
    }

    const initialDelay = options.initialDelay ?? DEFAULT_INITIAL_DELAY_MS;
    const requestDelay = options.requestDelay ?? DEFAULT_PER_REQUEST_DELAY_MS;

    console.log("Starting tag update process..."); // Changed log message
    console.log(`Input JSON file: "${fullInputPath}"`);
    console.log(`Initial delay: ${initialDelay / 1000}s, Per-request delay: ${requestDelay / 1000}s`);

    await processNoteTagsAndUpdate(fullInputPath, initialDelay, requestDelay); // Using renamed internal function
    console.log("Tag update process finished."); // Changed log message
}

// --- Function to register the command with Commander ---
export function registerTagupdateCommand(program: Command) { // Renamed registration function
  program
    .command('tagupdate') // CHANGED command name here
    .description('Updates tags for Anki notes based on an input JSON file, ensuring a specific tag structure.') // Updated description
    .option('-i, --input-file <filePath>', 'Full path to the input JSON file (overrides --input-dir and --filename).')
    .option('--input-dir <directoryPath>', `Directory of the input JSON file (default: "${DEFAULT_INPUT_DIR}")`)
    .option('--filename <fileName>', `Name of the input JSON file (default: "${DEFAULT_INPUT_FILENAME}")`)
    .option('--initial-delay <ms>', `Initial delay before starting updates in milliseconds (default: ${DEFAULT_INITIAL_DELAY_MS})`, s => parseInt(s,10))
    .option('--request-delay <ms>', `Delay between each AnkiConnect request in milliseconds (default: ${DEFAULT_PER_REQUEST_DELAY_MS})`, s => parseInt(s,10))
    .action(async (options: TagUpdateCommandOptions) => { // Using renamed options interface
        await tagupdateAction(options); // Calling renamed action
    });
}