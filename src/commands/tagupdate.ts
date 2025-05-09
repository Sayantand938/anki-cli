// src/commands/tagupdate.ts (or the file previously named tagreplace.ts)
import fs from "fs/promises";
import path from "path";
import axios, { AxiosError } from 'axios';
import { Command } from 'commander';

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_INPUT_DIR = "D:\\Codes\\anki-utils"; // Adjust if your default dir is different
const DEFAULT_INPUT_FILENAME = "notes/output.json";
const DEFAULT_INITIAL_DELAY_MS = 3000;
const DEFAULT_PER_REQUEST_DELAY_MS = 1000;
// ---------------------

// --- Type Definitions ---
interface NoteTagInfo {
    noteId: number | string;
    chosenTag: string;
}

export interface TagUpdateCommandOptions {
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
        if (action === 'replaceTags') {
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
async function processNoteTagsAndUpdate(
    fullInputFilePath: string,
    initialDelayMs: number,
    perRequestDelayMs: number
): Promise<void> {
    let noteData: NoteTagInfo[];

    try {
        const fileContent = await fs.readFile(fullInputFilePath, 'utf-8');
        noteData = JSON.parse(fileContent);
        if (!Array.isArray(noteData)) {
            throw new Error("Input file does not contain a valid JSON array.");
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // This error will be caught by Commander and printed.
            // The initial "Updating tags from..." messages might have already printed.
            throw new Error(`Input file not found: ${fullInputFilePath}. Please ensure the file exists.`);
        }
        throw new Error(`Error reading or parsing ${fullInputFilePath}: ${error.message}`);
    }

    if (noteData.length === 0) {
        console.log("No note data found in the file. Exiting."); // This will appear after "Starting updates..."
        return;
    }

    if (initialDelayMs > 0) {
        // Delay already announced by tagupdateAction
        await sleep(initialDelayMs);
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const totalNotes = noteData.length;

    console.log("Starting updates...\n"); // Newline for spacing before the list

    for (let i = 0; i < totalNotes; i++) {
        const noteInfo = noteData[i];
        const progressPrefix = `[${i + 1}/${totalNotes}]`;

        if (typeof noteInfo.noteId === 'undefined' || noteInfo.noteId === null ||
            typeof noteInfo.chosenTag !== 'string' || !noteInfo.chosenTag.trim()) {
            // Suppressed log: console.log(`${progressPrefix} ⚠️ Skipping invalid entry: Missing or invalid noteId/chosenTag. Entry: ${JSON.stringify(noteInfo)}`);
            errorCount++;
            skippedCount++;
            if (i < totalNotes - 1 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
            continue;
        }

        const noteId = Number(noteInfo.noteId);
        if (isNaN(noteId)) {
            // Suppressed log: console.log(`${progressPrefix} ⚠️ Skipping invalid entry: noteId "${noteInfo.noteId}" is not a valid number.`);
            errorCount++;
            skippedCount++;
            if (i < totalNotes - 1 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
            continue;
        }
        const chosenTag = noteInfo.chosenTag.trim();

        const tagParts = chosenTag.split('::');
        if (tagParts.length < 1 || !tagParts[0]) {
            // Suppressed log: console.log(`${progressPrefix} ⚠️ Skipping Note ID ${noteId}: chosenTag "${chosenTag}" has no valid first part (subject).`);
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
                console.log(`${progressPrefix} ✅ noteid: ${noteId} updated with tag ${replaceWithTag}`);
                successCount++;
            } else {
                 // Suppressed log: console.log(`${progressPrefix} ⚠️ noteid: ${noteId} - AnkiConnect 'replaceTags' returned unexpected result: ${JSON.stringify(result)}`);
                 errorCount++;
            }
        } catch (error: any) {
             // Suppressed log: console.log(`${progressPrefix} ❌ noteid: ${noteId} - Failed to update tags for "${tagToReplace}" with "${replaceWithTag}". Error: ${error.message}`);
            errorCount++;
        }

        if (i < totalNotes - 1 && perRequestDelayMs > 0) {
            await sleep(perRequestDelayMs);
        }
    }

    // --- Final Summary ---
    if (successCount === totalNotes && errorCount === 0) { // A perfect run (errorCount will be 0 if skippedCount is 0 and no API errors)
        console.log(`\n✓ All ${totalNotes} notes updated successfully.`);
    } else {
        console.log("\n--- Tag Update Summary ---");
        console.log(`  Total notes processed: ${totalNotes}`);
        console.log(`  Successfully updated:  ${successCount}`);
        const actualApiFailures = errorCount - skippedCount; // Failures beyond simple skips
        if (actualApiFailures > 0) {
            console.log(`  Failed operations:   ${actualApiFailures}`);
        }
        if (skippedCount > 0) {
            console.log(`  Skipped entries:     ${skippedCount}`);
        }
        console.log("--------------------------");
        if (successCount < totalNotes || errorCount > 0) { // If not a perfect run
            console.log("Tag update process completed with some issues or skips.");
        }
    }
}

// --- CLI Command Action ---
export async function tagupdateAction(options: TagUpdateCommandOptions): Promise<void> {
    let actualInputFilePath: string;
    let displaySource: string;

    // Determine the path that would be used if --input-file is not specified,
    // considering potential --input-dir and --filename overrides.
    const optionOrDefaultDir = options.inputDir || DEFAULT_INPUT_DIR;
    const optionOrDefaultFilename = options.filename || DEFAULT_INPUT_FILENAME;
    const pathIfDefaultOrOptions = path.join(path.resolve(optionOrDefaultDir), optionOrDefaultFilename);

    if (options.inputFile) {
        actualInputFilePath = path.resolve(options.inputFile);
        // If the provided --input-file resolves to the same location as the
        // default/options-derived path, use the default/options-derived filename string for display.
        // Otherwise, use the basename of the --input-file.
        if (actualInputFilePath === pathIfDefaultOrOptions) {
            displaySource = optionOrDefaultFilename.replace(/\\/g, '/');
        } else {
            displaySource = path.basename(actualInputFilePath).replace(/\\/g, '/');
        }
    } else {
        actualInputFilePath = pathIfDefaultOrOptions;
        displaySource = optionOrDefaultFilename.replace(/\\/g, '/');
    }

    const initialDelay = options.initialDelay ?? DEFAULT_INITIAL_DELAY_MS;
    const requestDelay = options.requestDelay ?? DEFAULT_PER_REQUEST_DELAY_MS;

    console.log(`Updating tags from ${displaySource}...`);
    console.log(`Initial delay: ${initialDelay / 1000}s | Per-request: ${requestDelay / 1000}s`);

    await processNoteTagsAndUpdate(actualInputFilePath, initialDelay, requestDelay);
    // Final "process finished" message is now part of the summary from processNoteTagsAndUpdate
}

// --- Function to register the command with Commander ---
export function registerTagupdateCommand(program: Command) {
  program
    .command('tagupdate')
    .description('Updates tags for Anki notes based on an input JSON file, ensuring a specific tag structure.')
    .option('-i, --input-file <filePath>', 'Full path to the input JSON file (overrides --input-dir and --filename).')
    .option('--input-dir <directoryPath>', `Directory of the input JSON file (default: "${DEFAULT_INPUT_DIR}")`)
    .option('--filename <fileName>', `Name of the input JSON file (default: "${DEFAULT_INPUT_FILENAME}")`)
    .option('--initial-delay <ms>', `Initial delay before starting updates in milliseconds (default: ${DEFAULT_INITIAL_DELAY_MS})`, s => parseInt(s,10))
    .option('--request-delay <ms>', `Delay between each AnkiConnect request in milliseconds (default: ${DEFAULT_PER_REQUEST_DELAY_MS})`, s => parseInt(s,10))
    .action(async (options: TagUpdateCommandOptions) => {
        await tagupdateAction(options);
    });
}