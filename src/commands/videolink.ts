// src/commands/videolink.ts
import fs from "fs/promises"; // Use promise-based fs
import path from "path";
import axios, { AxiosError } from 'axios'; // Use axios for HTTP requests
import { Command } from 'commander';

// --- Configuration (can be adjusted or made into options) ---
const ANKI_CONNECT_URL = "http://localhost:8765";
const TOKEN_FIELD_NAME = "TokenNo";         // Field in Anki note containing the token
const TARGET_UPDATE_FIELD = "Video";        // Field in Anki note to update with [sound:...]
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;         // milliseconds
const DEFAULT_DECK_NAME = "Custom Study Session"; // Deck name for fetching notes
const DEFAULT_TARGET_COPY_DIR = "D:\\AnkiData\\NOTES\\collection.media"; // Anki's media collection
const PRE_PROCESSING_DELAY_MS = 3000;       // Delay before processing starts
const INTER_NOTE_DELAY_MS = 1000;           // Delay between processing each note
// ---------------------

// --- Constants for Output ---
const SUCCESS_MARK = "[✓]";
const FAILURE_MARK = "[✗]";
const INDENT = "    ";
// --------------------------

// --- Type Definitions ---
interface AnkiNoteInfoFetched {
    noteId: number;
    fields: Record<string, { value: string, order: number }>;
    // Add other fields if notesInfo returns more that you use
}

interface ExtractedNoteInfo {
    noteId: number;
    tokenNo: string;
}

interface MkvFile {
    path: string;
    name: string;
}

interface ProcessItem {
    index: number;
    originalPath: string;
    originalFilename: string;
    noteId: number;
    token: string;
    newFilename: string;
    newPath: string;
    targetCopyPath: string;
    soundTag: string;
}

export interface VideolinkCommandOptions {
    path: string; // Source folder path for MKV files (required)
    ankiMediaDir?: string; // Optional override for Anki media directory
    deck?: string; // Optional override for Anki deck name
    tokenField?: string; // Optional override for the token field name
    videoField?: string; // Optional override for the target video field name
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
            // Specific error handling for deck/field not found
            if (action === "notesInfo" && response.data.error.includes("deck was not found")) {
                const deckName = params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name';
                throw new Error(`AnkiConnect Error: Deck "${deckName}" not found.`);
            }
            if (action === "updateNoteFields") {
                if (response.data.error.includes("field not found") || response.data.error.includes("no field named")) {
                    const fieldName = Object.keys(params?.note?.fields ?? {})[0] || TARGET_UPDATE_FIELD;
                    throw new Error(`AnkiConnect Error: Field "${fieldName}" not found in note ID ${params?.note?.id}. Ensure it exists in the note type.`);
                }
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
            } else if (axiosError.request) { // Network error, timeout
                throw new Error(`AnkiConnect request error: ${axiosError.message}. Check network or AnkiConnect status.`);
            }
        }
        // Re-throw if it's not an Axios error or already a custom error
        throw error;
    }
}


// --- Helper: Fetch Note Info (ID and Token) from Anki Deck ---
async function fetchNoteInfoForDeck(deckName: string, tokenFieldName: string): Promise<ExtractedNoteInfo[]> {
    // console.log(`[Anki] Fetching notes from deck: "${deckName}"...`); // Suppressed for CLI
    let notesInfo: AnkiNoteInfoFetched[];
    try {
        notesInfo = await ankiConnectRequest("notesInfo", { query: `deck:"${deckName}"` });
    } catch (err: any) {
        // Error is already specific from ankiConnectRequest
        throw new Error(`[Anki] Failed to fetch notes info: ${err.message}`);
    }

    if (!notesInfo || notesInfo.length === 0) {
        // console.log(`[Anki] No notes found in deck "${deckName}".`); // Suppressed
        return [];
    }

    const extractedNotes: ExtractedNoteInfo[] = [];
    let skippedCount = 0;

    notesInfo.forEach((note, index) => {
        const tokenValue = note?.fields?.[tokenFieldName]?.value;
        const noteId = note?.noteId;

        if (!noteId) {
            skippedCount++;
            return;
        }
        if (!tokenValue) {
            skippedCount++;
            return;
        }

        const sanitizedToken = tokenValue.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
        if (!sanitizedToken) {
            skippedCount++;
            return;
        }
        extractedNotes.push({ noteId: noteId, tokenNo: sanitizedToken });
    });

    if (skippedCount > 0) {
        console.warn(`[INFO] ${skippedCount} Anki notes were excluded due to missing Note ID or missing/invalid '${tokenFieldName}'.`);
    }
    return extractedNotes;
}


// --- Helper: Get and Sort MKV Files by Creation Time ---
async function getSortedMkvFiles(folderPath: string): Promise<MkvFile[]> {
    let filesWithStats: { path: string; name: string; timeMs: number }[] = [];
    try {
        const dirents = await fs.readdir(folderPath, { withFileTypes: true });
        const mkvFiles = dirents.filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.mkv');

        for (const file of mkvFiles) {
            const fullPath = path.join(folderPath, file.name);
            try {
                const stats = await fs.stat(fullPath);
                filesWithStats.push({ path: fullPath, name: file.name, timeMs: stats.birthtimeMs || stats.mtimeMs });
            } catch (statError: any) {
                console.warn(`[FS] Warning: Could not get stats for "${file.name}": ${statError.message}. Skipping file.`);
            }
        }
    } catch (readDirError: any) {
        throw new Error(`[FS] Failed to read directory "${folderPath}": ${readDirError.message}`);
    }

    filesWithStats.sort((a, b) => a.timeMs - b.timeMs);
    return filesWithStats.map(f => ({ path: f.path, name: f.name }));
}

// --- Helper: Delay Function ---
function delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}


// --- Core Processing Logic ---
async function processFilesAndNotes(
    sourceFolderPath: string,
    deckNameToUse: string,
    targetCopyDir: string,
    tokenFieldName: string,
    targetUpdateFieldAnki: string
): Promise<number> { // Returns exit code (0 for success, 1 for failure)
    let fileCount = 0;
    let noteCount = 0;
    let processCount = 0;
    let successRenameCount = 0, failRenameCount = 0, skippedRenameCount = 0;
    let successCopyCount = 0, failCopyCount = 0;
    let successAnkiUpdateCount = 0, failAnkiUpdateCount = 0;
    let overallSuccessCount = 0;

    // No try-catch here; let errors propagate to the main CLI handler in index.ts

    // --- 1. Preparation ---
    try {
        await fs.access(targetCopyDir, fs.constants.W_OK);
        const stats = await fs.stat(targetCopyDir);
        if (!stats.isDirectory()) throw new Error(`Target copy path "${targetCopyDir}" exists but is not a directory.`);
    } catch (err: any) {
        if (err.code === 'ENOENT') throw new Error(`Target copy directory not found: "${targetCopyDir}". Please create it or ensure the path is correct.`);
        else if (err.code === 'EACCES' || err.code === 'EPERM') throw new Error(`No write permission for target copy directory: "${targetCopyDir}".`);
        else throw new Error(`Error accessing target copy directory "${targetCopyDir}": ${err.message}`);
    }

    const fetchedNotes = await fetchNoteInfoForDeck(deckNameToUse, tokenFieldName);
    noteCount = fetchedNotes.length;
    if (noteCount === 0) {
        console.error("[INFO] No valid notes fetched from Anki. Nothing to process.");
        return 0; // Not an error state, but nothing to do.
    }

    const sortedMkvFiles = await getSortedMkvFiles(sourceFolderPath);
    fileCount = sortedMkvFiles.length;
    if (fileCount === 0) {
        console.error("[INFO] No MKV files found in the source folder. Nothing to process.");
        return 0;
    }

    processCount = Math.min(fileCount, noteCount);
    if (fileCount !== noteCount) {
        console.warn(`[WARNING] Mismatch: ${fileCount} MKV files vs ${noteCount} Anki notes. Processing the first ${processCount} pairs based on MKV creation time order.`);
    }
    if (processCount === 0) {
        console.error("[INFO] No file/note pairs to process after matching.");
        return 0;
    }

    const itemsToProcess: ProcessItem[] = [];
    for (let i = 0; i < processCount; i++) {
        const fileInfo = sortedMkvFiles[i];
        const noteInfo = fetchedNotes[i];
        const token = noteInfo.tokenNo;
        const newFilename = `${token}.mkv`; // Assumes token is filename-safe after sanitization
        const newPathInSource = path.join(sourceFolderPath, newFilename); // New path in the original source folder
        itemsToProcess.push({
            index: i,
            originalPath: fileInfo.path,
            originalFilename: fileInfo.name,
            noteId: noteInfo.noteId,
            token: token,
            newFilename: newFilename,
            newPath: newPathInSource, // Path for renaming in source
            targetCopyPath: path.join(targetCopyDir, newFilename), // Final path in Anki media
            soundTag: `[sound:${newFilename}]`,
        });
    }

    if (PRE_PROCESSING_DELAY_MS > 0) {
        await delay(PRE_PROCESSING_DELAY_MS);
    }

    // --- 2. Processing Loop ---
    console.log(`\n--- Processing ${processCount} Matched Items ---`);

    for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        console.log(`\n[${i + 1}/${processCount}] NoteID: ${item.noteId}, Token: ${item.token}`);

        let currentPathForCopy = item.originalPath;
        let stepFailedInLoop = false;

        // Step 2a: Rename (in source folder)
        if (item.originalPath === item.newPath) {
            console.log(`${INDENT}${SUCCESS_MARK} Renaming skipped (file "${item.originalFilename}" already matches token name)`);
            successRenameCount++;
            skippedRenameCount++;
        } else {
            try {
                // Check if target renamed file already exists in source
                await fs.access(item.newPath); // This will throw if it doesn't exist
                console.log(`${INDENT}${FAILURE_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                console.log(`${INDENT}${INDENT}Error: Target file "${item.newFilename}" already exists in source folder. Skipping rename.`);
                failRenameCount++;
                stepFailedInLoop = true; // Potentially problematic, as copy might use old name
                                         // Or, decide to use the existing item.newPath for copy if it exists.
                                         // For now, let's assume if rename fails due to existing, we might still want to copy that existing one.
                                         // Let's refine: if item.newPath exists, we assume it's the one we want and set currentPathForCopy to it.
                try {
                    // Verify we can read the existing target file before deciding to use it
                    await fs.access(item.newPath, fs.constants.R_OK);
                    currentPathForCopy = item.newPath; // Use the existing correctly named file
                    console.log(`${INDENT}[INFO] Using existing file "${item.newFilename}" for copy operation.`);
                    stepFailedInLoop = false; // No longer a failure for the overall process of this item
                    successRenameCount++; // Count as success because the desired file exists
                    skippedRenameCount++; // Skipped actual rename op
                } catch (accessErr){
                    console.log(`${INDENT}${INDENT}Error: Cannot access existing target file "${item.newFilename}". This item will likely fail.`);
                    stepFailedInLoop = true;
                }

            } catch (accessError: any) { // This block runs if item.newPath does NOT exist (ENOENT)
                if (accessError.code === 'ENOENT') {
                    try {
                        await fs.rename(item.originalPath, item.newPath);
                        console.log(`${INDENT}${SUCCESS_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                        successRenameCount++;
                        currentPathForCopy = item.newPath;
                    } catch (renameError: any) {
                        console.log(`${INDENT}${FAILURE_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                        console.log(`${INDENT}${INDENT}Error: ${renameError.message}`);
                        failRenameCount++;
                        stepFailedInLoop = true;
                    }
                } else { // Other access errors
                    console.log(`${INDENT}${FAILURE_MARK} Checking for target rename path "${item.newFilename}"`);
                    console.log(`${INDENT}${INDENT}Error: ${accessError.message}`);
                    failRenameCount++;
                    stepFailedInLoop = true;
                }
            }
        }

        if (stepFailedInLoop) {
            if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) await delay(INTER_NOTE_DELAY_MS);
            continue; // Skip to next item
        }

        // Step 2b: Copy (from source to Anki media)
        try {
            // Check if file already exists in Anki media. If so, overwrite or skip?
            // For simplicity, this version will overwrite. Add a check if skipping is preferred.
            // await fs.access(item.targetCopyPath); // If this doesn't throw, file exists.
            // console.log(`${INDENT}[INFO] File "${item.newFilename}" already exists in Anki media. Overwriting.`);

            await fs.copyFile(currentPathForCopy, item.targetCopyPath);
            console.log(`${INDENT}${SUCCESS_MARK} Copying "${path.basename(currentPathForCopy)}" to "${targetCopyDir}"`);
            successCopyCount++;
        } catch (copyError: any) {
            console.log(`${INDENT}${FAILURE_MARK} Copying "${path.basename(currentPathForCopy)}" to "${targetCopyDir}"`);
            console.log(`${INDENT}${INDENT}Error: ${copyError.message}`);
            failCopyCount++;
            stepFailedInLoop = true;
        }

        if (stepFailedInLoop) {
            if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) await delay(INTER_NOTE_DELAY_MS);
            continue; // Skip to next item
        }

        // Step 2c: Update Anki Note
        try {
            const payload = { note: { id: item.noteId, fields: { [targetUpdateFieldAnki]: item.soundTag } } };
            await ankiConnectRequest("updateNoteFields", payload);
            console.log(`${INDENT}${SUCCESS_MARK} Updating Anki field "${targetUpdateFieldAnki}" with "${item.soundTag}"`);
            successAnkiUpdateCount++;
            overallSuccessCount++; // Only count full success here
        } catch (updateError: any) {
            console.log(`${INDENT}${FAILURE_MARK} Updating Anki field "${targetUpdateFieldAnki}" with "${item.soundTag}"`);
            console.log(`${INDENT}${INDENT}Error: ${updateError.message}`);
            failAnkiUpdateCount++;
        }

        if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) {
            await delay(INTER_NOTE_DELAY_MS);
        }
    } // End of loop

    console.log("\n--- Processing Complete ---");
    console.log(`Source MKV Folder:          "${sourceFolderPath}"`);
    console.log(`Target Anki Deck:           "${deckNameToUse}"`);
    console.log(`Anki Media Directory:       "${targetCopyDir}"`);
    console.log(`Anki Token Field:           "${tokenFieldName}"`);
    console.log(`Anki Video Field (Update):  "${targetUpdateFieldAnki}"`);
    console.log("---------------------------");
    console.log(`Total MKV files found:        ${fileCount}`);
    console.log(`Total valid Anki notes found: ${noteCount}`);
    console.log(`File/Note pairs processed:    ${processCount}`);
    console.log("--- Operation Results ---");
    console.log("Rename (in source folder):");
    console.log(`  Success (Renamed):        ${successRenameCount - skippedRenameCount}`);
    console.log(`  Success (Skipped/As Is):  ${skippedRenameCount}`);
    console.log(`  Failed:                   ${failRenameCount}`);
    console.log("Copy (to Anki media):");
    console.log(`  Success:                  ${successCopyCount}`);
    console.log(`  Failed:                   ${failCopyCount}`);
    console.log("Anki Update:");
    console.log(`  Success:                  ${successAnkiUpdateCount}`);
    console.log(`  Failed:                   ${failAnkiUpdateCount}`);
    console.log("---------------------------");
    console.log(`Overall items completed successfully (all steps): ${overallSuccessCount} / ${processCount}`);

    if (failRenameCount > 0 || failCopyCount > 0 || failAnkiUpdateCount > 0) {
        console.error("\nErrors occurred during processing. Please review the logs above.");
        return 1; // Indicate failure
    } else if (processCount > 0 && overallSuccessCount === processCount) {
         console.log("\nAll items processed successfully!");
         return 0; // Indicate success
    } else if (processCount > 0) {
         console.log("\nProcessing finished, but some items may not have completed all steps (check logs).");
         return 0; // Still success, but with caveats
    }
    return 0; // Default success if nothing was processed but no errors occurred
}


// --- CLI Command Action ---
export async function videolinkAction(options: VideolinkCommandOptions): Promise<void> {
    // Resolve and validate the source MKV folder path
    let resolvedSourcePath = '';
    try {
        resolvedSourcePath = path.resolve(options.path.trim());
        const stats = await fs.stat(resolvedSourcePath);
        if (!stats.isDirectory()) {
            throw new Error(`The provided source path is not a directory: "${resolvedSourcePath}"`);
        }
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            throw new Error(`Source folder not found: "${resolvedSourcePath}" (Resolved from "${options.path}")`);
        }
        throw new Error(`Error accessing source path "${options.path}": ${err.message}`);
    }

    const deckNameToUse = options.deck || DEFAULT_DECK_NAME;
    const targetCopyDir = options.ankiMediaDir || DEFAULT_TARGET_COPY_DIR;
    const tokenFieldName = options.tokenField || TOKEN_FIELD_NAME;
    const targetUpdateFieldAnki = options.videoField || TARGET_UPDATE_FIELD;

    console.log(`Starting video linking process...`);
    console.log(`Source MKVs: "${resolvedSourcePath}"`);
    console.log(`Anki Deck: "${deckNameToUse}"`);
    console.log(`Anki Media Dir: "${targetCopyDir}"`);
    console.log(`Token Field: "${tokenFieldName}"`);
    console.log(`Video Field: "${targetUpdateFieldAnki}"`);

    // Errors from processFilesAndNotes will propagate to the main CLI error handler
    const exitCode = await processFilesAndNotes(
        resolvedSourcePath,
        deckNameToUse,
        targetCopyDir,
        tokenFieldName,
        targetUpdateFieldAnki
    );

    // The main CLI handler in index.ts will set process.exitCode based on thrown errors.
    // If processFilesAndNotes returns 1, we should ensure an error is thrown or exitCode is set.
    if (exitCode !== 0) {
        // This message might be redundant if processFilesAndNotes already logged errors.
        // Consider if a generic "process failed" error needs to be thrown here.
        // For now, the detailed logs from processFilesAndNotes should suffice.
        // Setting process.exitCode directly is an option, but throwing helps centralize error handling.
        throw new Error("Video linking process completed with errors. Check logs for details.");
    } else {
        console.log("Video linking process finished.");
    }
}

// --- Function to register the command with Commander ---
export function registerVideolinkCommand(program: Command) {
  program
    .command('videolink')
    .description('Rename/copy MKV files based on Anki note tokens and update a video field in Anki.')
    .requiredOption('-p, --path <folderPath>', 'Full path to the folder containing MKV files')
    .option('--deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
    .option('--anki-media-dir <mediaPath>', `Path to Anki's collection.media directory (default: "${DEFAULT_TARGET_COPY_DIR}")`)
    .option('--token-field <fieldName>', `Anki field name containing the token (default: "${TOKEN_FIELD_NAME}")`)
    .option('--video-field <fieldName>', `Anki field name to update with video link (default: "${TARGET_UPDATE_FIELD}")`)
    .action(async (options: VideolinkCommandOptions) => {
        await videolinkAction(options);
    });
}